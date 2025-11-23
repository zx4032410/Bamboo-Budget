<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Bamboo Budget - 竹子記帳本 🎋

像竹子一樣靈活、強韌的旅行記帳助手。

## ✨ 核心功能

### 📊 記帳管理
- **旅程管理**：建立多個旅程，分別追蹤不同行程的支出
- **支出記錄**：快速記錄每筆消費，支援多幣別
- **AI 收據辨識**：使用 Gemini AI 自動辨識收據內容
- **多幣別支援**：自動匯率轉換，統一換算為台幣
- **分帳功能**：支援多人分帳計算

### 🔐 認證系統
- **歡迎畫面**：首次啟動時選擇登入方式
  - 🚀 直接開始（訪客模式）- 資料存本機
  - 🔑 Google 登入 - 雲端同步，跨裝置使用
- **智慧資料遷移**：自動合併跨裝置資料，無縫切換
- **訪客升級**：訪客用戶可隨時綁定 Google 帳號備份資料

### 🤖 AI 功能
- **收據智慧辨識**：上傳收據照片自動提取資訊
  - 店家名稱
  - 消費金額和幣別
  - 購買日期
  - 商品清單（雙語顯示）
  - 匯率估算
- **使用限制保護**：
  - 預設每日 2 次免費額度
  - 可填寫個人 Gemini API Key 無限制使用
  - 用量即時顯示

### 🎨 介面設計
- **深色模式**：支援淺色/深色/自動切換
- **響應式設計**：完美適配手機和桌面
- **現代化 UI**：簡潔優雅的使用體驗

---

## 🚀 快速開始

### 本地開發

1. **安裝依賴**
   ```bash
   npm install
   ```

2. **設定環境變數**
   
   複製 `.env.local.example` 為 `.env.local`：
   ```bash
   cp .env.local.example .env.local
   ```
   
   編輯 `.env.local` 填入你的 Gemini API Key：
   ```
   VITE_GEMINI_API_KEY=your_api_key_here
   ```
   
   > 💡 取得 API Key：前往 [Google AI Studio](https://aistudio.google.com/apikey)

3. **啟動開發伺服器**
   ```bash
   npm run dev
   ```
   
   在瀏覽器開啟 `http://localhost:3001`

### 建置部署

```bash
npm run build
```

產生的檔案在 `dist/` 目錄，可直接部署到 Netlify、Vercel 等平台。

---

## 🔧 技術架構

### 前端框架
- **React 18** + **TypeScript**
- **Vite** - 快速開發建置工具
- **Tailwind CSS** - 現代化樣式框架

### 後端服務
- **Firebase Authentication** - 用戶認證（匿名 + Google）
- **Firebase Firestore** - 雲端資料庫
- **Google Gemini API** - AI 收據辨識

### 工具庫
- **date-fns** - 日期處理
- **uuid** - 唯一 ID 生成
- **Lucide React** - 圖示庫

---

## 📱 功能使用說明

### 首次使用

1. **選擇登入方式**
   - **直接開始**：資料僅存本機，快速體驗
   - **Google 登入**：資料同步雲端，跨裝置使用

2. **建立旅程**
   - 點擊首頁「建立旅程」
   - 填寫旅程名稱、日期、預算等資訊

3. **記錄支出**
   - 進入旅程，點擊「+」新增支出
   - **方式一**：拍照上傳收據，AI 自動辨識
   - **方式二**：手動填寫資訊

### AI 功能設定

前往「設定」→「AI 功能設定」：

- **使用共享額度**（預設）
  - 每日可用 2 次免費 AI 辨識
  - 適合輕度使用

- **使用個人 API Key**（無限制）
  - 填寫你的 Gemini API Key
  - 無使用次數限制
  - [取得 API Key](https://aistudio.google.com/apikey)

### 訪客升級 Google

1. 進入「設定」
2. 點擊「備份資料 (連結 Google)」
3. 完成 Google 認證
4. 訪客資料自動保留並同步

---

## 🌐 部署到 Netlify

### 方式一：通過 Netlify UI

1. 登入 [Netlify](https://netlify.com)
2. 點擊「Add new site」→「Import an existing project」
3. 連接 Git repository
4. 設定建置參數：
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. 加入環境變數：
   - `VITE_GEMINI_API_KEY`: 你的 Gemini API Key
6. 點擊「Deploy」

### 方式二：通過 Netlify CLI

```bash
# 安裝 Netlify CLI
npm install -g netlify-cli

# 登入
netlify login

# 初始化
netlify init

# 部署
netlify deploy --prod
```

### 重要設定

**Firebase Console 設定**
1. 前往 [Firebase Console](https://console.firebase.google.com)
2. Authentication → Settings → Authorized domains
3. 加入你的 Netlify 網域（如：`your-app.netlify.app`）

**Firestore Security Rules**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    match /expenses/{expenseId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

---

## 📝 環境變數說明

| 變數名稱 | 說明 | 必要性 |
|---------|------|--------|
| `VITE_GEMINI_API_KEY` | Gemini API 金鑰 | 選填* |

> *如果不設定此變數，用戶需要在應用內填寫自己的 API Key 才能使用 AI 功能

---

## 🔒 隱私與安全

- ✅ 所有資料加密傳輸
- ✅ Firebase Security Rules 保護
- ✅ 用戶資料完全隔離
- ✅ 支援匿名模式（資料僅存本機）
- ✅ API Key 可選擇性自行管理

---

## 🛠️ 疑難排解

### AI 功能無法使用

**問題**：上傳收據後沒反應或顯示錯誤

**解決方式**：
1. 檢查是否有設定 Gemini API Key
2. 確認 API Key 是否有效
3. 檢查是否達到每日使用限制
4. 可在設定中填寫個人 API Key

### 跨裝置資料不同步

**問題**：在不同裝置看不到資料

**解決方式**：
1. 確認使用相同 Google 帳號登入
2. 檢查網路連線
3. 嘗試登出後重新登入

### 訪客資料遺失

**解決方式**：
- 訪客資料僅存本機，清除瀏覽器資料會遺失
- 建議綁定 Google 帳號備份資料

---

## 📄 授權

MIT License

---

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

---

## 📮 聯絡方式

如有問題或建議，歡迎透過 GitHub Issues 提出。

---

**Built with ❤️ using React + Vite + Firebase + Gemini AI**
