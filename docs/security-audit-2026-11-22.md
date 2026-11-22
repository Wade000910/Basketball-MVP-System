# 資安檢查（2026-11-22）

方法：程式碼掃描（注入點、密鑰、歷史紀錄）、Supabase 官方安全掃描（advisors）、既有權限測試（49 項）、兩個非 Claude 模型獨立審查（Gemini、gpt-oss-120b），逐項由作者核對後取捨。

## 沒有問題
- 密鑰：目前與整份 git 歷史都沒有 `service_role`／secret key／JWT；網站只放可公開的 publishable key（`shared/cloud-config.js`），且有測試禁止放入私密金鑰。
- 注入（XSS）：所有 `innerHTML` 寫入的內容都是固定文字或數字（導覽列、新手導覽、問卷刻度、研究頁表格的序號與 Δt），沒有使用者可控字串；姓名與備註一律用文字節點（端對端測試「hostile names and notes are shown as text, never run」）。
- 內容安全政策（CSP）：每頁 `default-src 'none'`、`object-src 'none'`、`base-uri 'none'`、`form-action 'self'`、行內腳本只用雜湊；沒有 `unsafe-eval`。
- 資料庫：每張表都有列級權限（RLS），權限測試 49 項通過，故意關掉 RLS 會失敗；內部輔助函式已從 anon 收回執行權（`20261121000200_helper_privileges.sql`）。

## 這次修正
1. **CSP 收緊：**`script-src` 原本允許 `https://cdn.jsdelivr.net` 整個網站（任何套件），改成每頁只列實際用到的固定版本路徑（supabase-js 2.119.0、onnxruntime-web 1.20.1、MediaPipe 與 chart.js 的指定版本）。測試 `tests/csp.test.js` 鎖住這個規則；端對端 40 項通過，頁面載入正常。
2. **onnxruntime 動態載入缺完整性雜湊（SRI）：**`shoot/ball-detector.js` 以 JavaScript 加入 CDN 腳本時沒有 integrity（審查模型指出，作者核實屬實）。已加 `sha384` 與 `crossOrigin`；新測試 `tests/supply-chain.test.js` 要求所有 JS 動態載入的 CDN 腳本都有，改回舊版時測試會失敗。注意：目前相機判斷進球功能沒有啟用模型（`available()` 為 false），這段在實際使用中不會被執行。ort 之後以 fetch 讀取的 `.wasm` 檔無法用這種方式釘住。

## 需要執行長決定（動到雲端設定，Agent 不自己做）
- **隊友記球 6 碼的強度（低到中風險）：**`add_shot_mark` 允許未登入者呼叫。代碼 32 個字元 × 6 位 ≈ 10.7 億種組合、12 小時內有效、每組最多 300 筆，但代碼由 PostgreSQL 一般亂數 `random()` 產生，也沒有失敗次數限制。最壞情況是陌生人替別人的練習亂加「進／沒進」（只影響完整性，不外洩資料）。建議的遷移：改用密碼學亂數（`gen_random_bytes`）、有效時間 12 → 2 小時、連續猜錯時短暫延遲；需要對正式資料庫套用遷移。
- **洩漏密碼檢查（Supabase 官方警告）：**後台「Auth → 密碼安全」的 Leaked password protection 目前關閉，可能需付費方案，只有執行長能操作。

## 已知、接受的限制
- GitHub Pages 無法設定 HTTP 標頭，所以沒有 `frame-ancestors`（防點擊劫持）與 HSTS 以外的標頭；沒有一鍵就能造成損害的動作（刪帳號與刪隊伍要二次確認）。
- `style-src 'unsafe-inline'` 與 `wasm-unsafe-eval`：頁面用行內樣式；MediaPipe／onnxruntime 的 WebAssembly 需要後者。
- Supabase 登入憑證放在瀏覽器 `localStorage`（靜態網站無法用 HttpOnly Cookie）；風險靠嚴格 CSP 與無使用者可控內容的頁面降低。
- 審查模型提出的「錯誤訊息太具體」影響極低，未改。
