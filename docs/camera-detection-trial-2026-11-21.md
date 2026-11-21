# 相機判斷進球：現成模型試驗（2026-11-21）

**結論：通用物體偵測模型找不到真實罰球畫面裡的籃球，不能用，相機選項保持關閉。**

## 做了什麼

- 判斷規則（`shoot/hoop.js`）、觀察視窗（`shoot/hoop-watch.js`）、模型輸出解析（`shoot/yolo.js`、`shoot/yolox.js`）、
  籃框由球員點左右邊緣設定（`shoot/layout.js`）、瀏覽器端執行（`shoot/ball-detector.js`）都已完成並測試。
- 規則與整合用模擬球軌跡與假偵測器測過（`tests/hoop.test.js`、`tests/e2e/site.e2e.js`）。

## 試了什麼模型

YOLOX（Apache-2.0，COCO 預訓練，類別 32 = sports ball）的 ONNX 輸出，在瀏覽器以 onnxruntime-web（wasm）執行。

| 模型 | 檔案大小 | 單張耗時（這台虛擬機，CPU） | 5 張真實罰球照片找到球 |
|---|---|---|---|
| YOLOX-Nano | 3.7 MB | 約 150–200 ms | 0 張（門檻 0.3、0.15 都沒有；0.05 時 1 張，位置在畫面邊緣，不可信） |
| YOLOX-Tiny | 20 MB | 約 420–500 ms | 2 張（門檻 0.15）；其餘沒有 |

照片來自 Wikimedia Commons 的罰球照片（CC BY／CC BY-SA 授權），只在本機用來測試，沒有放進專案。
另用公有領域籃球圖貼在灰底上時，模型把它判成「風箏」而不是球，也說明通用模型不穩定。
樣本只有 5 張，數字只說明「不堪用」，不是準確度估計。

## 下一步（需要資料與運算）

要用這條路，必須有「籃球與籃框」的標註資料（例如 Roboflow Universe 上的公開資料集，先逐個確認授權），
在 GPU 上微調 YOLOX-Nano，匯出 ONNX，再用至少 100 球的真實影片驗證偵測率與進／沒進判斷的準確度。
完成後把模型放進 `shoot/models/`，在 `shoot/camera-config.js` 設定路徑，選項就會出現。
