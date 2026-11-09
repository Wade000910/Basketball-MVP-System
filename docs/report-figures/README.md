# 報告圖片

由 `node tools/report-figures.cjs` 產生，請勿手動修改圖片。標示「測試資料」或「示範資料」的畫面不是真實使用結果。

| 圖號 | 檔案 | 說明 | 來源 |
| --- | --- | --- | --- |
| 圖 4.1 | [ui-home.png](./ui-home.png) | 系統首頁（手機畫面） | `/` |
| 圖 4.2 | [ui-shoot-setup.png](./ui-shoot-setup.png) | 罰球投籃頁：設定與拍攝引導（手機畫面） | `tools/shoot-browser-check.cjs` |
| 圖 4.3 | [ui-shoot-practice.png](./ui-shoot-practice.png) | 罰球投籃頁：練習中，顯示上一球節奏、比分與語音記錄（測試資料） | `tools/shoot-browser-check.cjs` |
| 圖 4.4 | [ui-shoot-teammate.png](./ui-shoot-teammate.png) | 隊友幫記頁：輸入記錄碼後按「進／沒進」 | `tools/shoot-browser-check.cjs` |
| 圖 4.5 | [ui-shoot-summary.png](./ui-shoot-summary.png) | 結束一組：命中率、平均節奏與逐球修正（測試資料） | `tools/shoot-browser-check.cjs` |
| 圖 4.6 | [ui-shoot-landscape.png](./ui-shoot-landscape.png) | 罰球投籃頁橫放版面（測試資料） | `tools/shoot-browser-check.cjs` |
| 圖 4.7 | [ui-training-home.png](./ui-training-home.png) | 球員首頁：開始訓練與雲端備份入口（手機畫面） | `/training/` |
| 圖 4.8 | [ui-coach-demo.png](./ui-coach-demo.png) | 教練總覽（示範資料，非真實結果） | `/coach/?demo=1` |
| 圖 4.9 | [ui-research.png](./ui-research.png) | 研究模式：完整角度、速度曲線與實驗分組 | `/專題程式/` |
| 圖 4.10 | [test-unit.png](./test-unit.png) | 自動化單元測試結果（依測試檔彙整，共 120 項全部通過） | `npm test` |
| 圖 4.11 | [test-rls.png](./test-rls.png) | 資料庫權限（RLS）測試：41 個情境全部通過 | `supabase/tests/run.sh` |
| 圖 4.12 | [test-equivalence.png](./test-equivalence.png) | 球員版偵測器與研究頁判斷邏輯比對：300 種模擬情境結果完全相同 | `tools/research-equivalence-check.cjs` |
| 圖 4.13 | [test-shoot-flow.png](./test-shoot-flow.png) | 罰球投籃頁與隊友幫記的瀏覽器流程測試 | `tools/shoot-browser-check.cjs` |
| 圖 4.14 | [test-training-flow.png](./test-training-flow.png) | 球員首頁、場邊記錄與雲端流程的瀏覽器測試（36 項） | `tools/training-browser-smoke.cjs` |
| 圖 5.1 | [sim-onset-sd.png](./sim-onset-sd.png) | 模擬實驗：起始定義的誤差標準差與影格率、時間抖動的關係 | `tools/simulate-timing.cjs` |
| 圖 5.2 | [sim-peak-sd.png](./sim-peak-sd.png) | 模擬實驗：峰值定義的誤差標準差與影格率、時間抖動的關係 | `tools/simulate-timing.cjs` |
| 圖 5.3 | [sim-peak-camera.png](./sim-peak-camera.png) | 模擬實驗：改用相機影格時間後的峰值定義誤差 | `tools/simulate-timing.cjs` |
| 圖 5.4 | [ui-validation.png](./ui-validation.png) | 慢動作對照頁：逐格標記事件，與系統試次比較 | `/validation/` |
