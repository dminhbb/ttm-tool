import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
export interface ConfirmDialogProps { isOpen:boolean; onClose:()=>void; onConfirm:()=>void; title:string; description:string; confirmLabel?:string; cancelLabel?:string; steps?:1|2; }
export function ConfirmDialog({isOpen,onClose,onConfirm,title,description,confirmLabel='Xác nhận',cancelLabel='Hủy',steps=1}:ConfirmDialogProps){return <Modal isOpen={isOpen} onClose={onClose} title={title} footer={<><Button onClick={onClose} variant="outline">{cancelLabel}</Button><Button onClick={onConfirm} variant="danger">{steps===2?'Tiếp tục ':''}{confirmLabel}</Button></>}><p className="text-fb-text-secondary">{description}</p></Modal>;}
