# Supabase 設定

雲端備份與球隊功能使用 Supabase（Postgres、帳號、權限）。不設定時，網站照常以本機模式運作。

## 一次性設定

1. 在 [supabase.com](https://supabase.com) 建立專案（免費方案即可，區域選東京或新加坡）。
2. 到 **SQL Editor**，貼上 [`migrations/20261103000000_team_sync.sql`](./migrations/20261103000000_team_sync.sql) 全部內容並執行。
3. 到 **Authentication → URL Configuration**：
   - **Site URL** 設為 `https://wade000910.github.io/Basketball-MVP-System/training/`
   - **Redirect URLs** 加入 `https://wade000910.github.io/Basketball-MVP-System/**`
4. （選擇）測試期間若不想收確認信：**Authentication → Providers → Email** 關閉 *Confirm email*。正式使用建議保持開啟。
5. 到 **Project Settings → API**，把 **Project URL** 與 **publishable key**（舊版稱 anon key）填入 [`../shared/cloud-config.js`](../shared/cloud-config.js)。

> ⚠️ 只放 publishable／anon key。**secret key 或 service_role key 絕對不能放進程式或 repository**；`npm test` 會檢查。

## 權限設計

| 資料 | 誰可以讀 | 誰可以寫 |
| --- | --- | --- |
| 訓練紀錄 `training_sessions` | 本人；本人所在球隊的教練 | 只有本人 |
| 顯示名字 `profiles` | 本人；同隊成員 | 只有本人 |
| 球隊 `teams` | 隊員 | 建立者成為教練；教練可改名或刪除 |
| 隊員 `team_members` | 隊員 | 只能透過邀請碼加入；本人可退出，教練可移除球員 |

- 球員退出球隊後，教練立即看不到他的紀錄；球員自己的資料不受影響。
- 命中數由資料庫依逐球紀錄計算，不信任前端傳來的統計。
- 影片不會上傳；雲端只存訓練室本來就能匯出的摘要。

## 本機驗證

需要 PostgreSQL 16（`initdb`、`pg_ctl`、`psql`）：

```bash
supabase/tests/run.sh
```

會建立暫時資料庫，套用最小化的 Supabase 角色與 `auth.uid()`，再執行 22 項權限情境，例如別隊教練看不到資料、球員不能把自己升為教練、退隊後教練失去存取。
