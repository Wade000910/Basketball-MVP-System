# 交接筆記（2026-11-09）

給下一個對話用：先讀這份、`ROADMAP.md` 和報告文件，再接著做。

## 規則（不可違反）
- 等使用者說「開始做」才開始新工作；說「上傳」才 push、開 PR、合併（一次涵蓋三者）。
- 程式只能放 Supabase publishable key；secret / service_role key 不可進 repo（`npm test` 會檢查）。
- 國科會計畫書、個資、原始實測影片與 CSV 都不進 repo（原始資料在使用者電腦 `Desktop\研究本機資料`）。
- 模擬或示範資料必須標明，不可當真實資料。
- 不替使用者輸入密碼或建立帳號。

## 目前狀態
- 網站：https://wade000910.github.io/Basketball-MVP-System/ （投籃頁 `shoot/`、隊友記錄 `mark.html`、教練頁 `coach/`）
- 後端：Supabase（ref `mhwzadmfihtcnujaadng`），7 張表全開 RLS；`supabase/tests/rls.test.sql` 41 項通過。
- 檢查：`npm test` 120 項；`tools/report-figures.cjs` 一次重跑全部檢查並產生報告圖（需 `BROWSER_BIN` 指向 Chromium）。
- 判斷邏輯：`shoot/engine.js` 逐行移植研究頁的狀態機（`player-peak-v1`），與研究頁 300 情境逐筆等價（`tools/research-equivalence-check.cjs`）。改演算法前必須先跑等價檢查。
- 濾波器：兩個 2 階 Butterworth 串接的因果版本，10 Hz；在 10 Hz 衰減約 −6 dB（不是標準四階的 −3 dB），30 fps 時低頻延遲約 27–35 ms。

## 報告
- Claude 文件「Basketball MVP 專題報告（整合初稿）」：https://claude.ai/artifact/MmLJnEZ3aUxwDB6UtnbHkH
  - 「文獻查證」分頁：35 篇文獻逐筆查證（另一個模型也已獨立複查）。
  - 3.5 節「設計依據」表：每個設計選擇的文獻依據，以及文獻沒證明的部分。
- 學校格式：A4，左邊界 3.8 cm、其他 2.5 cm；章 18 pt、節 14 pt、內文 12 pt、雙行距；最後一章是「結論與未來發展」，「專案管理」放在它前面。

## 待辦（依優先順序）
1. 用 8 月原始角度做殘差分析，比較 6、8、10 Hz 的 Δt 差異（不需要等人，可直接做）。
2. 拍 40–60 球 240 fps 慢動作，與系統 Δt 做 Bland–Altman 比較（目標：平均差 ±20 ms 以內、95% 一致性界限 ±90 ms 以內）。
3. 系隊試用並收 SUS 問卷（目標 ≥ 70）；手機上量語音辨識正確率與 fps。
4. 讀 Templin 2023 全文（ISBS 41(1):105），目前只能引用摘要。
5. 填報告中的【待補】、轉 Word 格式、做海報、改版介面。

## 等使用者回覆
- 同學的 GitHub 帳號（要給寫入權限）。
- 確認專題目標與門檻（含 SUS ≥ 70）。
- 介面風格參考、亮色或暗色。
- 展覽、口試、交報告的日期。
- 是否關掉 Supabase 註冊時的 email 確認。
