#!/usr/bin/env node
/**
 * Demo content for "Bản tin" (owner 2026-11-06): 3 categories with 3, 6 and 11 published articles (title, summary,
 * body, no image), authored by the first active SUPERADMIN, readable by every role, published one day apart up to today.
 *
 *   node scripts/seed-news-letter-demo.js --target=supabase            # add (refused if the demo categories exist)
 *   node scripts/seed-news-letter-demo.js --target=supabase --remove   # delete the demo categories and their articles
 *
 * Targets: local / supabase (same connection settings as scripts/migrate-db.js).
 */
const fs = require('fs');
const { loadEnvConfig } = require('@next/env');
const { Pool } = require('pg');

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const target = ((args.find((arg) => arg.startsWith('--target=')) || '').split('=')[1] || '').trim().toLowerCase();
const remove = args.includes('--remove');
if (target !== 'local' && target !== 'supabase') {
  console.error('Thiếu hoặc sai --target. Dùng --target=local hoặc --target=supabase.');
  process.exit(1);
}

function stripSslModeParam(connectionString) {
  return connectionString.replace(/([?&])sslmode=[^&]*&?/i, '$1').replace(/[?&]$/, '');
}

function poolConfig() {
  if (target === 'supabase') {
    if (!process.env.DATABASE_URL_SUPABASE) {
      console.error('Thiếu DATABASE_URL_SUPABASE trong .env.local.');
      process.exit(1);
    }
    const ssl = process.env.PGSSLROOTCERT_SUPABASE
      ? { ca: fs.readFileSync(process.env.PGSSLROOTCERT_SUPABASE, 'utf8'), rejectUnauthorized: true }
      : { rejectUnauthorized: false };
    return { connectionString: stripSslModeParam(process.env.DATABASE_URL_SUPABASE), ssl, max: 1 };
  }
  if (process.env.DATABASE_URL_LOCAL) return { connectionString: process.env.DATABASE_URL_LOCAL, max: 1 };
  return { host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, max: 1 };
}

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** [category, [[title, summary, [3 key points]], ...]] */
const DEMO = [
  ['Tin tức TTM', [
    ['Ra mắt Bản tin TTM', 'Kênh thông tin mới giúp mọi người dùng TTM Monitor nắm nhanh các thay đổi về quy trình, chỉ số và tính năng.', ['Bài viết mới nhất luôn hiện đầu tiên', 'Mục lục chia theo phân loại', 'Chấm đỏ trên menu khi có bài chưa đọc']],
    ['Báo cáo Epic start sớm đã có trên TTM Monitor', 'Báo cáo mới so sánh chỉ số TTM-CNTT hiện tại với chỉ số tính theo ngày start thực tế của Epic.', ['Khuyến nghị "Start sớm" do Scoring Service gán', 'So sánh 2 chỉ số ngay trên 4 widget', 'Danh sách Epic bị Fail khi tính theo ngày start sớm']],
    ['Chỉ số TTM-CNTT tháng 10/2026: điểm nhìn nhanh', 'Tổng hợp các điểm đáng chú ý của chỉ số TTM-CNTT (QLDA) trong tháng 10/2026 và những việc cần làm tiếp theo.', ['Tỷ lệ Đạt giữ ổn định so với tháng trước', 'Số Epic thiếu lý do Fail giảm rõ', 'Cần rà soát Start Date của các Epic start sớm']],
  ]],
  ['Thông báo hệ thống', [
    ['Lịch bảo trì hệ thống cuối tuần', 'Hệ thống tạm ngừng trong khung giờ bảo trì để nâng cấp hạ tầng cơ sở dữ liệu.', ['Bảo trì từ 22:00 thứ Bảy đến 02:00 Chủ nhật', 'Dữ liệu import không bị ảnh hưởng', 'Không cần thao tác gì thêm sau bảo trì']],
    ['Thay đổi chính sách gia hạn phiên đăng nhập', 'Phiên đăng nhập được tự gia hạn khi bạn đang làm việc trên các màn hình chính, có giới hạn tối đa theo ngày.', ['Gia hạn khi phiên còn dưới 30 phút', 'Tối đa 12 giờ, hoặc 2 ngày khi chọn Ghi nhớ đăng nhập', 'Hết hạn thì đăng nhập lại như bình thường']],
    ['Cập nhật crawl tool V16: trường dữ liệu mới', 'Crawl tool bổ sung các trường ngày bắt đầu thực tế của Epic, Story và thông tin Resolved của Subtask.', ['Epic_Real_Start_Date và Story_Real_Start_Date', 'subtask_Resolved và subtask_Assignees_Role', 'Epic trống ngày start thực tế được lấy theo dòng trước đó']],
    ['Thời gian import dữ liệu hằng ngày', 'Dữ liệu Jira được import mỗi buổi sáng; các chỉ số và cache được làm mới ngay sau đó.', ['Import xong trước 8:30 mỗi ngày làm việc', 'Cache dòng Epic được tạo lại sau import', 'Dòng "Dữ liệu cập nhật lần cuối" cho biết thời điểm import']],
    ['Phân quyền mới trong Ma trận phân quyền', 'Ma trận phân quyền có thêm chức năng Bản tin; mặc định mọi role đều được xem.', ['SUPERADMIN soạn và quản trị bài viết', 'Có thể tắt quyền Xem theo từng role', 'Mỗi bài viết còn có phân quyền riêng theo role']],
    ['Lưu ý khi dùng chế độ Xem dưới quyền', 'Chế độ Xem dưới quyền cho phép xem dữ liệu như một người dùng khác nhưng không thay đổi dữ liệu thay họ.', ['Chỉ đọc, không ghi comment thay người khác', 'Banner vàng cho biết đang xem dưới quyền ai', 'Bấm Trở về Lead để thoát chế độ này']],
  ]],
  ['Hướng dẫn sử dụng', [
    ['Đọc phễu TTM Dashboard 2 trong 5 phút', 'Cách đọc từng tầng phễu từ L01 đến L05 và mở danh sách Epic của mỗi tầng.', ['Bấm vào tầng để xem công thức', 'Hoàn thành / Chưa hoàn thành mở phễu chi tiết', 'Tooltip biểu đồ tròn cho biết số Epic từng phần']],
    ['Lọc Epic theo khuyến nghị trên Quản trị Epic', 'Dùng bộ lọc SCORING để tìm nhanh các Epic cần cập nhật dữ liệu trên Jira.', ['Khuyến nghị hiện trong cột SCORING', 'Kết hợp lọc theo PM/SM và Domain', 'Xoá lọc để quay về danh sách đầy đủ']],
    ['Ghi Review Notes cho một Epic', 'Ghi chú trao đổi về một Epic ngay trên ứng dụng, có giao việc và theo dõi trạng thái.', ['Bấm cờ ở cột Review để mở Review Notes', 'Enter để gửi comment', 'Đánh dấu Giao việc Done khi đã xử lý xong']],
    ['Dùng popup Duyệt Epic', 'Popup Duyệt Epic cho thấy cây Story, Subtask và các mốc ngày của Epic.', ['Bấm mã Epic ở mọi danh sách để mở', 'Cột Start Date và Actual Start Date', 'Mở Jira ở tab mới bằng icon bên cạnh']],
    ['Hiểu badge Sai lệch dữ liệu', 'Ý nghĩa các rule R1 đến R11 và cách sửa dữ liệu trên Jira để Epic được chấm điểm.', ['Epic Sai lệch dữ liệu nằm ngoài mẫu số', 'Mỗi rule kèm khuyến nghị cách sửa', 'Sửa xong, lần import sau sẽ tự cập nhật']],
    ['Tạo Rule Group theo mốc ngày', 'Rule Group cho phép áp dụng bộ rule khác nhau cho các nhóm Epic theo ngày tạo, ngày start hoặc R4G Date.', ['Nhóm ưu tiên cao được xét trước', 'Mỗi slot bật tối đa 1 rule', 'Nhóm Default luôn áp dụng sau cùng']],
    ['Xuất báo cáo Epic theo dự án', 'Báo cáo Epic gom Epic của một dự án thành 6 danh sách và in được ra PDF.', ['Chọn dự án và lớp dữ liệu', 'Có thể so sánh 2 lớp dữ liệu', 'Dùng nút In để xuất PDF']],
    ['Đối chiếu các lớp dữ liệu snapshot', 'Cách chọn lớp dữ liệu cũ để xem trạng thái Epic tại một ngày trong quá khứ.', ['30 ngày import gần nhất luôn có sẵn', 'Ngày làm việc cuối tuần được giữ lâu dài', 'Chọn lớp so sánh để thấy thay đổi']],
    ['Theo dõi Epic Pending lâu', 'Nhận biết Epic ở trạng thái Pending quá lâu và các bước xử lý đề xuất.', ['Badge Pending lâu trong cột SCORING', 'Lọc nhanh bằng bộ lọc Pending lâu', 'Cập nhật status trên Jira khi Epic tiếp tục']],
    ['Thiết lập Epic ngoại lệ', 'Epic ngoại lệ không được tính vào các chỉ số Time to Market; cách thêm và gỡ một Epic.', ['Bật công tắc TTM Black listed trong Duyệt Epic', 'Epic TTM-applied = Không áp dụng được thêm tự động', 'Gỡ ngoại lệ để Epic được tính lại']],
    ['Đọc mục Lịch sử thay đổi của bài viết', 'Mỗi bài viết Bản tin lưu người tạo và 5 lần sửa gần nhất ở cuối bài.', ['Chữ nhỏ màu xám ở cuối bài', 'Ghi thời gian và người sửa', 'Chỉ giữ 5 lần sửa gần nhất']],
  ]],
];

function bodyOf(title, summary, points, index) {
  const parts = [
    `<p>${esc(summary)} Bài viết này tóm tắt những điều cần biết về <strong>${esc(title.toLowerCase())}</strong> để bạn áp dụng ngay trong công việc hằng ngày.</p>`,
    '<h2>Điểm chính</h2>',
    `<ul>${points.map((point) => `<li><p>${esc(point)}</p></li>`).join('')}</ul>`,
    '<h2>Chi tiết</h2>',
    '<p>TTM Monitor tổng hợp dữ liệu từ Jira mỗi ngày, chấm điểm từng Epic bằng Scoring Service và hiển thị kết quả trên các màn hình giám sát. Nội dung dưới đây giải thích cách thông tin được tính và cách đọc trên giao diện.</p>',
    '<p>Nếu số liệu trên màn hình khác với điều bạn thấy trên Jira, hãy kiểm tra thời điểm import gần nhất ở dòng <em>Dữ liệu cập nhật lần cuối</em>: thay đổi trên Jira chỉ xuất hiện sau lần import tiếp theo.</p>',
  ];
  if (index % 3 === 0) {
    parts.push('<table><tbody><tr><th><p>Hạng mục</p></th><th><p>Mô tả</p></th></tr>'
      + points.map((point, row) => `<tr><td><p>Mục ${row + 1}</p></td><td><p>${esc(point)}</p></td></tr>`).join('')
      + '</tbody></table>');
  }
  parts.push('<blockquote><p>Mọi góp ý về nội dung Bản tin xin gửi về nhóm quản trị TTM Monitor.</p></blockquote>');
  return parts.join('');
}

async function main() {
  const pool = new Pool(poolConfig());
  const client = await pool.connect();
  const categoryNames = DEMO.map(([name]) => name);
  try {
    await client.query('BEGIN');
    if (remove) {
      const deleted = await client.query('DELETE FROM news_letter_articles WHERE category_id IN (SELECT id FROM news_letter_categories WHERE name = ANY($1)) RETURNING id', [categoryNames]);
      await client.query('DELETE FROM news_letter_categories WHERE name = ANY($1)', [categoryNames]);
      await client.query('COMMIT');
      console.log(`Đã xoá ${deleted.rowCount} bài viết demo và ${categoryNames.length} phân loại demo.`);
      return;
    }
    const existing = await client.query('SELECT name FROM news_letter_categories WHERE name = ANY($1)', [categoryNames]);
    if (existing.rowCount) throw new Error(`Đã có phân loại demo (${existing.rows.map((row) => row.name).join(', ')}). Chạy --remove trước nếu muốn seed lại.`);
    const author = await client.query("SELECT id FROM users WHERE role = 'SUPERADMIN' AND is_active ORDER BY id LIMIT 1");
    if (!author.rowCount) throw new Error('Không có SUPERADMIN đang hoạt động để làm tác giả.');
    const authorId = author.rows[0].id;

    // Oldest first, one day apart, the newest published today.
    const all = DEMO.flatMap(([category, articles]) => articles.map((article) => ({ category, article })));
    let dayOffset = all.length;
    let index = 0;
    for (const [category, articles] of DEMO) {
      const created = await client.query('INSERT INTO news_letter_categories (name, created_by) VALUES ($1, $2) RETURNING id', [category, authorId]);
      const categoryId = created.rows[0].id;
      for (const [title, summary, points] of articles) {
        dayOffset -= 1;
        await client.query(`
          INSERT INTO news_letter_articles (title, summary, category_id, is_published, first_published_at, content_html, created_by, created_at, updated_by, updated_at)
          VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP - ($5 || ' days')::interval, $4, $6, CURRENT_TIMESTAMP - ($5 || ' days')::interval, $6, CURRENT_TIMESTAMP - ($5 || ' days')::interval)
        `, [title, summary, categoryId, bodyOf(title, summary, points, index), String(dayOffset), authorId]);
        index += 1;
      }
    }
    await client.query('COMMIT');
    console.log(`Đã seed ${all.length} bài viết: ${DEMO.map(([name, articles]) => `${name} (${articles.length})`).join(', ')}.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
