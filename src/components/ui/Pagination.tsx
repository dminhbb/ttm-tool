import { Button } from '@/components/ui/Button';

interface PaginationProps {
  currentPage: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  pageSize: number;
  totalItems: number;
}

export function Pagination({ currentPage, itemLabel = 'dự án', onPageChange, pageSize, totalItems }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;
  return <nav aria-label="Phân trang" className="ui-pagination flex items-center justify-between gap-3"><span className="text-fb-text-secondary">Trang {currentPage}/{totalPages} · {totalItems} {itemLabel}</span><div className="flex gap-2"><Button disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} size="sm" variant="outline">Trước</Button><Button disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} size="sm" variant="outline">Sau</Button></div></nav>;
}
