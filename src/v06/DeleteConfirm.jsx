import React from 'react';
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
export function DeleteConfirm({ open, title, name, detail, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="veil delete-confirm-veil">
      <div className="modal delete-confirm">
        <div className="delete-confirm-icon">
          <AlertTriangle size={36} />
        </div>
        <h2>{title}</h2>
        {name && <p className="danger-confirm"><strong>"{name}"</strong></p>}
        <p>{detail}</p>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel}>取消</button>
          <button className="primary danger" onClick={onConfirm}>确认删除</button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirm;
