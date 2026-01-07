# メールフィルターテスト

## 環境構築

```PowerShell
# Githubからクローン
git clone https://github.com/Kazuhiko-Saito/mail-test.git

# クローンしたフォルダに移動
cd mail-test

# 環境構築
npm install

# Prisma初期化
npx prisma generate
npx prisma migrate dev

# サーバーの起動
npm run dev
```
## 環境変数

下記内容をもとにプロジェクトのルートに `.env` ファイルを作成する。

```env
# POP3サーバーの接続情報
MAIL_SERVERNAME=pop.example.com
MAIL_SERVERPORT=110

# POP3サーバーのログイン情報
MAIL_USERNAME=meil@example.com
MAIL_PASSWORD=password

# DB接続情報（Prisma ⁺ PostgreSQL）
DATABASE_URL="postgresql://user:pass@localhost:5432/maildb"
```