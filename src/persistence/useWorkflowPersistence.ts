import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { assetResources, nodeAssetUrls } from '../nodes/assetResources';
import { workflowSignature } from './workflowSignature';
import { WorkflowStorage, type Workflow } from './workflowStorage';

export function useWorkflowPersistence(storage: WorkflowStorage, workflow: Workflow) {
  const [status, setStatus] = useState('已保存到此浏览器');
  const signature = useMemo(() => workflowSignature(workflow), [workflow]);
  const [error, setError] = useState('');
  const latest = useRef({ workflow, signature });
  // Flow mounts only after storage.load(), so its first render is the baseline.
  // A pristine empty canvas also needs no write until its first real edit.
  const savedSignature = useRef(signature);
  const assetOwner = useRef(Symbol('pending canvas save'));
  const saving = useRef(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (saving.current) return;
    if (latest.current.signature === savedSignature.current) {
      dirty.current = false;
      setError('');
      setStatus('已保存到此浏览器');
      return;
    }
    dirty.current = true;
    saving.current = true;
    setStatus('正在保存…');
    try {
      while (latest.current.signature !== savedSignature.current) {
        const next = latest.current;
        await storage.save(next.workflow);
        // Advance only after commit. If undo or another edit happened during
        // the write, the loop persists that newer content before reporting saved.
        savedSignature.current = next.signature;
      }
      dirty.current = false;
      setError('');
      setStatus('已保存到此浏览器');
    } catch (cause) {
      setError(cause instanceof Error && cause.name === 'WorkflowConflictError' ? cause.message
        : cause instanceof Error && cause.name === 'QuotaExceededError'
        ? '浏览器存储空间不足，画布尚未保存。请释放空间后重试。'
        : '画布尚未保存，请重试并保持页面打开。');
      setStatus('保存失败');
    } finally { saving.current = false; }
  }, [storage]);

  useLayoutEffect(() => {
    latest.current = { workflow, signature };
    assetResources.adopt(assetOwner.current, nodeAssetUrls(workflow.nodes));
  }, [workflow, signature]);

  useLayoutEffect(() => {
    dirty.current = saving.current || signature !== savedSignature.current;
    if (!dirty.current) {
      setError('');
      setStatus('已保存到此浏览器');
    } else if (!saving.current) {
      setStatus('等待保存…');
      timer.current = setTimeout(() => { void flush(); }, 250);
    }
    // Transient selection/measurement updates do not restart this debounce.
    return () => clearTimeout(timer.current);
  }, [signature, flush]);

  useLayoutEffect(() => {
    const owner = assetOwner.current;
    return () => assetResources.release(owner);
  }, []);

  useEffect(() => {
    const save = () => { if (dirty.current) void flush(); };
    const hidden = () => { if (document.visibilityState === 'hidden') save(); };
    const leaving = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      save();
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', leaving);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', save);
      window.removeEventListener('beforeunload', leaving);
    };
  }, [flush]);

  return { status, error, retry: () => { void flush(); } };
}
