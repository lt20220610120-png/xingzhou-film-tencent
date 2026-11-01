"""One inference owner, bounded pending requests, real list-based model batches."""
import logging
import threading
import time
from collections import deque
from concurrent.futures import Future


class QueueFull(Exception):
    pass


class ServiceClosing(Exception):
    pass


class BatchScheduler:
    def __init__(self, generate, max_batch_size=6, max_pending=24, batch_window_seconds=.12,
                 is_oom=lambda exc: False, recover_oom=lambda: None, batch_limit=None):
        self.generate = generate
        self.max_batch_size = max_batch_size
        self.effective_max_batch_size = max_batch_size
        self.max_pending = max_pending
        self.batch_window_seconds = batch_window_seconds
        self.is_oom, self.recover_oom = is_oom, recover_oom
        self.batch_limit = batch_limit
        self.condition = threading.Condition()
        self.pending = deque()
        self.closing = False
        self.active = 0
        self.last_batch_size = 0
        self.largest_successful_batch = 0
        self.completed = 0
        self.oom_retries = 0
        self.worker = threading.Thread(target=self._run, name='qwen-inference', daemon=False)
        self.worker.start()

    def submit(self, value):
        future = Future()
        with self.condition:
            if self.closing:
                raise ServiceClosing('Service is shutting down')
            self.pending = deque(item for item in self.pending if not item[1].cancelled())
            if len(self.pending) >= self.max_pending:
                raise QueueFull('Inference queue is full; retry later')
            self.pending.append((value, future))
            self.condition.notify()
        return future

    def snapshot(self):
        with self.condition:
            return dict(mode='dynamic_batch', max_batch_size=self.max_batch_size,
                        effective_max_batch_size=self.effective_max_batch_size,
                        recommended_client_concurrency=self.effective_max_batch_size,
                        max_pending=self.max_pending, pending=sum(not item[1].cancelled() for item in self.pending), active=self.active,
                        last_batch_size=self.last_batch_size,
                        largest_successful_batch=self.largest_successful_batch,
                        completed=self.completed, oom_retries=self.oom_retries, closing=self.closing)

    def close(self, wait=True):
        with self.condition:
            self.closing = True
            while self.pending:
                _, future = self.pending.popleft()
                if future.set_running_or_notify_cancel():
                    future.set_exception(ServiceClosing('Service is shutting down'))
            self.condition.notify_all()
        if wait:
            self.worker.join()

    def _run(self):
        while True:
            with self.condition:
                self.condition.wait_for(lambda: self.pending or self.closing)
                if self.closing:
                    return
                deadline = time.monotonic() + self.batch_window_seconds
                while len(self.pending) < self._current_limit() and not self.closing:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        break
                    self.condition.wait(remaining)
                if self.closing:
                    return
                batch = []
                limit = self._current_limit()
                while self.pending and len(batch) < limit:
                    # Future.cancel() does not acquire our condition: validate the
                    # actual next live input too, even if cancellation changed the
                    # candidate prefix since _current_limit() inspected it.
                    next_value, next_future = self.pending[0]
                    if not next_future.cancelled() and self.batch_limit is not None:
                        next_limit = max(1, min(limit, self.batch_limit([value for value, _ in batch] + [next_value])))
                        if len(batch) >= next_limit:
                            break
                    item = self.pending.popleft()
                    if item[1].set_running_or_notify_cancel():
                        batch.append(item)
                self.active = len(batch)
            if batch:
                self._process(batch)
            with self.condition:
                self.active = 0

    def _current_limit(self):
        limit = self.effective_max_batch_size
        if self.batch_limit is not None:
            values = [value for value, future in self.pending if not future.cancelled()][:limit]
            if values:
                limit = max(1, min(limit, self.batch_limit(values)))
        return limit

    def _process(self, batch):
        outputs, error, oom = None, None, False
        try:
            outputs = self.generate([value for value, _ in batch])
            if len(outputs) != len(batch):
                raise RuntimeError('Model output count does not match input batch')
        except Exception as exc:
            oom = self.is_oom(exc)
            if not oom:
                error = exc
        # Leave the exception scope before cache cleanup: traceback can hold GPU tensors.
        if oom:
            self.recover_oom()
            if len(batch) > 1:
                split = max(1, len(batch) // 2)
                with self.condition:
                    self.effective_max_batch_size = min(self.effective_max_batch_size, split)
                    self.oom_retries += 1
                logging.warning('GPU OOM: retrying %d requests in smaller real batches', len(batch))
                self._process(batch[:split])
                self._process(batch[split:])
                return
            error = RuntimeError('GPU memory is full; close other GPU applications and try a shorter text')
        if error is None:
            with self.condition:
                self.last_batch_size = len(batch)
                self.largest_successful_batch = max(self.largest_successful_batch, len(batch))
                self.completed += len(batch)
            for (_, future), output in zip(batch, outputs):
                future.set_result(output)
        else:
            for _, future in batch:
                future.set_exception(error)
