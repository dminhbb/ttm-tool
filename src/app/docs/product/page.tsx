export default function ProductDocsPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-fb-text-secondary">
        Tài liệu trình bày toàn bộ workflow, chức năng và logic xử lý dữ liệu của TTM Monitor — dùng để đào tạo người dùng mới.
      </p>
      <iframe
        title="Tài liệu sản phẩm TTM Monitor"
        src="/docs/product-guide.html"
        className="w-full rounded-lg border border-fb-border bg-white"
        style={{ height: 'calc(100dvh - 180px)', minHeight: 480 }}
      />
    </div>
  );
}
