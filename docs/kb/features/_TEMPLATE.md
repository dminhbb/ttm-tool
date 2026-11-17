# <Tên chức năng> — `<route màn hình>`

Cập nhật lần cuối: yyyy-mm-dd. Khi sửa file/bảng/contract liệt kê dưới đây, sửa luôn card này trong cùng commit.

## Mục đích

2–3 câu: chức năng làm gì, cho ai. BRD: `brd/...`. Spec: `docs/...`.

## Điểm vào

| Loại | Đường dẫn |
|---|---|
| Màn hình | `src/app/...` |
| API | `METHOD /api/...` → `src/app/api/.../route.ts` |
| Job / MCP / script | ... |

## Luồng dữ liệu

```text
nguồn → adapter → bảng → service → cache → API → UI   (mỗi chặng ghi 1 file chính)
```

## Sửa gì ở đâu

| Muốn sửa | File chính |
|---|---|

## Bảng DB

- Đọc: ...
- Ghi: ...

## Contract

Type, tham số API, cột DB, rule id mà nơi khác đang dựa vào.

## Test

File test đang bảo vệ chức năng; phần nào chưa có test thì ghi rõ.

## Phụ thuộc chéo

Chức năng khác bị ảnh hưởng khi sửa chức năng này.

## Bẫy đã biết

Quyết định của chủ sản phẩm (kèm ngày), lỗi cũ, chỗ dễ sửa sai.
