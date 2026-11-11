# AI Dev Team — Bàn giao để tiếp tục

Cập nhật: 2026-11-09. Đây là bản tóm tắt phiên làm việc, không phải xác nhận trạng thái cloud tại thời điểm đọc lại.

## Mục tiêu và nguyên tắc

Xây hệ thống nhận yêu cầu phát triển phần mềm, chọn context, sửa code, chạy kiểm tra, review và trả diff để người dùng duyệt trước khi tạo draft PR.

Ưu tiên chi phí thấp, chất lượng và tốc độ theo năm nguyên tắc: context engineering, progressive disclosure, model routing, deterministic validation và diff-based development. Chỉ dùng Planner/Reviewer khi cần; không triển khai nhiều agent đồng thời, vector database hoặc knowledge graph ở MVP.

## Vị trí và liên kết

- Local: `C:\Users\MyPC\OneDrive\Máy tính\ai-dev-team`
- GitHub public: https://github.com/tylum123/ai-dev-team
- Nhánh: `main`
- Commit đã push và xác nhận đồng bộ gần nhất: `bcf137d` — Document hosted demo and enable manual CI validation.
- Vercel: https://ai-dev-team-olive.vercel.app
- Vercel project: `ai-dev-team`, scope `tylum123-gmailcoms-projects`.
- Project ID: `prj_GtQawpUNRB4TcLKT1w17KhJ6NM7U`.

## Đã hoàn thành

- MVP Node.js 22+, ES modules, không có dependency npm bên ngoài; frontend HTML/CSS/JavaScript.
- Dashboard tiếng Việt: tạo task, lịch sử, context, diff, quality gates, log, telemetry và duyệt draft PR.
- Retrieval dựa trên tên file và import trực tiếp; tối đa 10 file, 32.000 ký tự nội dung. Chưa có AST/symbol index.
- Patch dùng before/after khớp chính xác một lần; chặn sửa file chưa đọc, traversal, symlink, secrets, lockfiles, AGENTS.md và thay đổi scripts/dependencies trong package.json.
- Routing đơn giản/phức tạp; Planner và Reviewer tùy chọn. Reviewer chạy sau quality gates đạt.
- Giới hạn 2 lượt Coder, 6 lần gọi AI; đo input/output/cache token, model, latency và chi phí nếu cấu hình giá.
- Quality gates chạy script có sẵn trong Docker offline: format:check, lint, typecheck, test, build. Script thiếu được ghi skipped; test phải đạt trước khi ready.
- Có 11 test đã chạy đạt và static build đã thành công trong phiên trước. Các test mock API/Docker; chưa chứng minh tích hợp Live thật.
- Git đã khởi tạo, repo chuyển public theo yêu cầu người dùng và push đầy đủ đến commit nêu trên.
- Vercel deploy qua CLI thành công, đã kiểm tra trạng thái Ready và HTML trả về đúng build.

## Giới hạn và việc chưa hoàn tất

- **Vercel chỉ chạy Demo trong bộ nhớ trình duyệt**: mẫu diff cố định, không gọi AI, không xử lý yêu cầu thật, không sửa repo hoặc tạo PR; tải lại trang sẽ mất lịch sử.
- Backend Live vẫn chạy qua `npm start` trên máy có Git, Docker, API key/model và gh authentication. Chưa có `.env` trong lần kiểm tra; Docker daemon khi đó chưa chạy.
- Image mặc định node:22-alpine phù hợp repo không cần cài dependencies. Repo phức tạp cần sandbox/image được chuẩn bị riêng.
- Chưa có đăng nhập ứng dụng hoặc phân quyền đa người dùng. Server local bind 127.0.0.1, có kiểm tra Host/Origin.
- Task lưu JSON trong `.data`; một task hoạt động mỗi lần. Restart đánh dấu interrupted, chưa tự resume.
- Publish lỗi có thể để lại remote branch; cần kiểm tra trước khi thử lại.
- GitHub Actions lần đầu báo startup_failure; chưa xác minh một lần CI trên cloud thành công. Workflow đã bổ sung workflow_dispatch.
- Vercel Git integration chưa kết nối được. Người dùng đã báo cài GitHub App nhưng API vẫn báo thiếu integration. Đã đề nghị kiểm tra Vercel Account Settings → Authentication → GitHub liên kết đúng tylum123. Người dùng sau đó chỉ yêu cầu push Git, nên dừng xử lý kết nối.
- Không khẳng định auto-deploy GitHub → Vercel đang hoạt động. Deploy CLI đã hoạt động.
- Khóa automation bypass do `vercel curl` tự tạo đã được thu hồi. Không cần tạo lại để đọc metadata deployment.

## File quan trọng

| File | Vai trò |
| --- | --- |
| server.js | HTTP, lưu task, Demo, chạy workflow, publish draft PR |
| core.js | Subprocess, kiểm tra path/URL, Responses API, ước tính chi phí |
| workflow.js | Retrieval, routing, patch validation, tải skills |
| runner.js | Orchestrator, quality gates Docker, telemetry |
| public/ | Dashboard local và nguồn static frontend |
| deploy/hosted-demo.js | Adapter Demo dành riêng cho bản Vercel |
| scripts/build.mjs | Build static bằng allowlist vào dist/ |
| vercel.json | Cấu hình static deployment |
| skills/ | Hướng dẫn frontend/backend/testing theo nhu cầu |
| test/ | Unit/integration test với API và container được mock |
| docs/architecture.md | Thiết kế và giới hạn |
| deploy/ | Tài liệu và systemd mẫu cho Linux worker; chưa triển khai worker |

## Lệnh chạy

```powershell
cd "C:\Users\MyPC\OneDrive\Máy tính\ai-dev-team"
npm start
npm test
npm run build
```

Local: http://127.0.0.1:4310. Build static ở dist/. Không đưa API key vào frontend. Không commit .env, .data, .vercel hoặc credentials.

GitHub CLI đã xác thực tylum123; Vercel CLI đã đăng nhập trong phiên này. Kiểm tra lại trước khi thao tác. CLI Vercel dùng `npx.cmd --yes vercel@latest`.

Git ngoài sandbox từng báo dubious ownership vì thư mục do tài khoản sandbox tạo. Đã xử lý theo từng lệnh với `git -c safe.directory='C:/Users/MyPC/OneDrive/Máy tính/ai-dev-team' push origin main`, không thêm ngoại lệ global.

## Bước 2 đã lên kế hoạch, chưa triển khai

Mục tiêu: Multi-Agent chạy thật, điều phối đáng tin cậy và kiểm soát chi phí.

1. **Kiểm chứng Live trước:** cấu hình API, Docker, repo thử nghiệm; chạy một task tạo diff và test thật. Ghi nhận token và lỗi hạ tầng.
2. **Tách agent:** Planner, Coder, Reviewer thành module độc lập, định nghĩa và kiểm tra schema đầu vào/đầu ra.
3. **State machine:** chuyển trạng thái hợp lệ, lưu sau mỗi bước, chống task chạy trùng, hủy task và xử lý gián đoạn có kiểm soát.
4. **Context theo vai trò:** Planner dùng map/đoạn code cần thiết; Coder dùng file đã chọn; Reviewer dùng diff, tiêu chí chấp nhận và code liên quan.
5. **Routing/ngân sách:** chọn model theo vai trò; giới hạn thời gian, lượt gọi và chi phí dự kiến. Lỗi Docker/network không tự chuyển thành vòng sửa code. Task nhạy cảm về quyền, xác thực, dữ liệu cần Reviewer.
6. **Dashboard/nghiệm thu:** trạng thái từng bước, retry, model, token, lỗi, nút hủy; chạy task đơn giản và phức tạp, kiểm tra các nhánh lỗi và chờ duyệt.

Ưu tiên thực hiện mục 1–3 trước. Giữ 2 lượt Coder/6 lần gọi AI, chạy tuần tự. Kiểm chứng worker local trước; kết nối dashboard online với worker cần thêm xác thực, API và lưu trạng thái chung. Chưa cần chuyển ngay sang Next.js/NestJS/PostgreSQL/Redis.

## Lưu ý cho phiên tiếp theo

- Đọc AGENTS.md trước khi sửa; người dùng yêu cầu giữ nguyên file này. Nội dung inventory ban đầu đã cũ; README và bản bàn giao này mô tả phần mới.
- Kiểm tra git status và thay đổi mới của người dùng trước khi làm tiếp.
- Không gọi Demo là Live hoặc coi mock tests là bằng chứng Docker/API/GitHub chạy thật.
- Người dùng ưu tiên hành động, chi phí thấp và push Git. Không tiếp tục xử lý Vercel authentication nếu chưa cần cho tác vụ mới.
- File bàn giao này được tạo sau commit bcf137d; kiểm tra Git để biết đã được commit/push hay chưa.

## Prompt tiếp tục gợi ý

“Đọc AGENTS.md và docs/HANDOFF.md trong ai-dev-team. Tiếp tục bước 2, ưu tiên xác minh Live rồi tách agent và xây state machine. Giữ chi phí thấp, không sửa AGENTS.md; báo rõ phần đã kiểm chứng thật và phần còn mock.”
