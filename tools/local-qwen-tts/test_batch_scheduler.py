import threading
import unittest
from concurrent.futures import CancelledError
import batch_scheduler as batching


class SchedulerTests(unittest.TestCase):
    def test_cancel_during_limit_calculation_revalidates_actual_batch_inputs(self):
        calls, futures = [], []
        limit_calls = 0
        def batch_limit(values):
            nonlocal limit_calls
            limit_calls += 1
            if limit_calls == 2:
                for future in futures[:3]:
                    self.assertTrue(future.cancel())
            return 3 if any(len(value) > 80 for value in values) else 6
        def generate(items):
            calls.append(list(items))
            return items
        scheduler = batching.BatchScheduler(generate, max_batch_size=6, batch_window_seconds=.05,
                                            batch_limit=batch_limit)
        try:
            values = [f'short{i}' for i in range(6)] + ['long' * 21 + str(i) for i in range(3)]
            with scheduler.condition:
                futures.extend(scheduler.submit(value) for value in values)
            self.assertEqual([future.result(2) for future in futures[3:]], values[3:])
            self.assertEqual([len(call) for call in calls], [3, 3])
        finally:
            scheduler.close()

    def test_cancelled_prefix_long_limit_and_oom_retry_preserve_all_live_outputs(self):
        class OOM(Exception):
            pass
        calls = []
        def generate(items):
            calls.append(list(items))
            if len(items) > 2:
                raise OOM()
            return items
        scheduler = batching.BatchScheduler(generate, max_batch_size=6, batch_window_seconds=.05,
                                            batch_limit=lambda values: 3 if any(len(v) > 80 for v in values) else 6,
                                            is_oom=lambda exc: isinstance(exc, OOM))
        try:
            values = [f'short{i}' for i in range(6)] + ['long' * 21 + str(i) for i in range(3)]
            with scheduler.condition:
                futures = [scheduler.submit(value) for value in values]
                for future in futures[:3]:
                    self.assertTrue(future.cancel())
            self.assertEqual([future.result(2) for future in futures[3:]], values[3:])
            self.assertTrue(all(future.cancelled() for future in futures[:3]))
            self.assertTrue(all(len(call) <= 3 for call in calls if any(len(value) > 80 for value in call)))
            self.assertEqual(scheduler.snapshot()['effective_max_batch_size'], 1)
        finally:
            scheduler.close()

    def test_cancelled_prefix_does_not_hide_live_long_inputs_from_batch_limit(self):
        calls = []
        def generate(items):
            calls.append(list(items))
            return items
        scheduler = batching.BatchScheduler(generate, max_batch_size=6, batch_window_seconds=.05,
                                            batch_limit=lambda values: 3 if any(len(v) > 80 for v in values) else 6)
        try:
            values = [f'short{i}' for i in range(6)] + ['long' * 21 + str(i) for i in range(3)]
            # Prevent the worker consuming entries until the exact canceled prefix exists.
            with scheduler.condition:
                futures = [scheduler.submit(value) for value in values]
                for future in futures[:3]:
                    self.assertTrue(future.cancel())
            self.assertEqual([future.result(2) for future in futures[3:]], values[3:])
            self.assertEqual([len(call) for call in calls], [3, 3])
            self.assertTrue(all(len(call) <= 3 for call in calls if any(len(value) > 80 for value in call)))
        finally:
            scheduler.close()

    def test_large_inputs_use_smaller_real_batches_with_all_requests_preserved(self):
        calls = []
        def generate(items):
            calls.append(list(items))
            return items
        scheduler = batching.BatchScheduler(generate, max_batch_size=6, batch_window_seconds=.05,
                                            batch_limit=lambda values: 3 if any(len(v) > 80 for v in values) else 6)
        try:
            values = ['a' * 81 + str(i) for i in range(6)]
            futures = [scheduler.submit(value) for value in values]
            self.assertEqual([f.result(2) for f in futures], values)
            self.assertEqual([len(call) for call in calls], [3, 3])
        finally:
            scheduler.close()

    def test_simultaneous_requests_use_one_real_batch_and_keep_output_order(self):
        calls = []
        def generate(items):
            calls.append(items)
            return [value * 10 for value in items]
        scheduler = batching.BatchScheduler(generate, max_batch_size=6, batch_window_seconds=.05)
        try:
            futures = [scheduler.submit(i) for i in range(6)]
            self.assertEqual([future.result(2) for future in futures], [i * 10 for i in range(6)])
            self.assertEqual(calls, [list(range(6))])
        finally:
            scheduler.close()

    def test_cancelled_queued_request_is_skipped_without_shifting_outputs(self):
        scheduler = batching.BatchScheduler(lambda values: [v + 1 for v in values], batch_window_seconds=.1)
        try:
            first, cancelled, last = [scheduler.submit(i) for i in range(3)]
            self.assertTrue(cancelled.cancel())
            self.assertEqual(first.result(2), 1)
            self.assertEqual(last.result(2), 3)
            with self.assertRaises(CancelledError):
                cancelled.result()
        finally:
            scheduler.close()

    def test_oom_splits_batch_and_completes_every_request(self):
        class OOM(Exception):
            pass
        calls = []
        def generate(items):
            calls.append(list(items))
            if len(items) > 2:
                raise OOM()
            return [str(i) for i in items]
        scheduler = batching.BatchScheduler(generate, max_batch_size=6, batch_window_seconds=.05,
                                            is_oom=lambda exc: isinstance(exc, OOM))
        try:
            futures = [scheduler.submit(i) for i in range(6)]
            self.assertEqual([f.result(2) for f in futures], list(map(str, range(6))))
            self.assertEqual(calls[0], list(range(6)))
            self.assertLessEqual(scheduler.snapshot()['effective_max_batch_size'], 2)
        finally:
            scheduler.close()

    def test_bounded_queue_and_shutdown_resolve_pending_futures(self):
        entered, release = threading.Event(), threading.Event()
        def generate(items):
            entered.set()
            release.wait(2)
            return items
        scheduler = batching.BatchScheduler(generate, max_batch_size=1, max_pending=1)
        running = scheduler.submit(1)
        self.assertTrue(entered.wait(1))
        pending = scheduler.submit(2)
        with self.assertRaises(batching.QueueFull):
            scheduler.submit(3)
        scheduler.close(wait=False)
        with self.assertRaises(batching.ServiceClosing):
            pending.result(1)
        with self.assertRaises(batching.ServiceClosing):
            scheduler.submit(4)
        release.set()
        self.assertEqual(running.result(2), 1)
        scheduler.close()

    def test_generation_failure_and_cardinality_mismatch_fail_all_affected_requests(self):
        for generate in [lambda items: [], lambda items: (_ for _ in ()).throw(ValueError('failure'))]:
            scheduler = batching.BatchScheduler(generate, batch_window_seconds=.03)
            try:
                futures = [scheduler.submit(i) for i in range(3)]
                for future in futures:
                    with self.assertRaises((ValueError, RuntimeError)):
                        future.result(2)
            finally:
                scheduler.close()


if __name__ == '__main__':
    unittest.main()
