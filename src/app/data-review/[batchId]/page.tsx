import { DataReviewTable } from '@/components/data-review/DataReviewTable';

interface DataReviewPageProps {
  params: Promise<{ batchId: string }>;
}

export default async function DataReviewPage({ params }: DataReviewPageProps) {
  const { batchId } = await params;
  const numericBatchId = Number(batchId);

  if (!Number.isInteger(numericBatchId) || numericBatchId < 1) {
    return <p className="text-status-danger">Lớp dữ liệu không hợp lệ.</p>;
  }

  return <DataReviewTable batchId={numericBatchId} />;
}
