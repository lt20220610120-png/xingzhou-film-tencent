import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';

/**
 * 删除确认弹窗
 * @param {Object} props
 * @param {boolean} props.open - 是否显示
 * @param {string} props.title - 标题（如"删除项目"）
 * @param {string} props.name - 项目/条目名称
 * @param {string} props.detail - 详细说明
 * @param {function} props.onCancel - 取消回调
 * @param {function} props.onConfirm - 确认删除回调
 */
export function DeleteConfirm({ open, title, name, detail, onCancel, onConfirm, confirmLabel = '确认删除', busy = false, error }) {
  const modalRef = React.useRef(null);
  const latest = React.useRef({ onCancel, busy }); latest.current = { onCancel, busy };
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    modalRef.current?.querySelector('button')?.focus();
    const keyDown = event => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onCancel();
      if (event.key !== 'Tab') return;
      const buttons = [...modalRef.current.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener('keydown', keyDown);
    return () => { document.removeEventListener('keydown', keyDown); previous?.focus(); };
  }, [open]);
  if (!open) return null;

  return createPortal((
    <div className="veil delete-confirm-veil">
      <div ref={modalRef} className="modal delete-confirm" role="dialog" aria-modal="true" aria-label={title} aria-busy={busy}>
        <div className="delete-confirm-icon">
          <AlertTriangle size={36} />
        </div>
        <h2>{title}</h2>
        {name && <p className="danger-confirm"><strong>"{name}"</strong></p>}
        <p>{detail}</p>
        {error && <p className="collab-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="ghost" disabled={busy} onClick={onCancel}>取消</button>
          <button className="primary danger" disabled={busy} onClick={onConfirm}>{busy ? '正在清理…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  ), document.body);
}

export default DeleteConfirm;
