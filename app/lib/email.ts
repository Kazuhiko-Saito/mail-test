import POP3Client from "poplib";
import PostalMime from "postal-mime";
import { prisma } from "./prisma";

const mailsetting = {
  username: process.env.MAIL_USERNAME,
  password: process.env.MAIL_PASSWORD,
  server: {
    name: process.env.MAIL_SERVERNAME,
    port: process.env.MAIL_SERVERPORT,
  },
};

// キーワード
const keywords: string[] = [];

// 抽出
const regexStrings: string[] = [];

let currentMsgNum: number = 1;
let totalMsgCount: number = 0;

export const emailProcessor = () => {
  const client = new POP3Client(
    mailsetting.server.port,
    mailsetting.server.name,
    {
      tlserrs: false,
      enabletls: false,
      debug: false,
    }
  );

  client.on("connect",  () => {
    console.log("CONNECT success");
    client.login(mailsetting.username, mailsetting.password);
  });

  client.on("login", (status, rawdata) => {
    if (status) {
      console.log("LOGIN/PASS success");
      client.list();
    } else {
      console.log("LOGIN/PASS failed");
      client.quit();
    }
  });

  client.on("list",  (status, msgcount, msgnumber, data, rawdata) => {
    if (!status) {
      console.log("LIST failed");
      client.quit();
    } else {
      console.log("LIST success with " + msgcount + " element(s)");
      // トータルメッセージ数保持
      totalMsgCount = msgcount;
      // メッセージがある場合は最初のメッセージ取得
      if (msgcount > 0) {
        currentMsgNum = 1;
        client.retr(currentMsgNum);
      } else {
        client.quit();
      }
    }
  });

  client.on("retr", async (status, msgnumber, data, rawdata) => {
    // 現在のメッセージ番号を保持
    currentMsgNum = msgnumber;
    if (!status) {
      console.log("RETR failed for msgnumber " + msgnumber);
      client.quit();
    } else {
      console.log("RETR success for msgnumber " + msgnumber);
      // メールを登録
      if (await storeMail(data)) {
        // 次のメッセージ取得
        if (currentMsgNum < totalMsgCount) {
          currentMsgNum++;
          client.retr(currentMsgNum);
        } else {
          client.quit();
        }
      } else {
        client.quit();
      }
    }
  });

  client.on("quit",  (status, rawdata) => {
    if (status) {
      console.log("QUIT success");
    } else {
      console.log("QUIT failed");
    }
  });
}

const storeMail = async (data) => {
  // メールパース
  const email = await PostalMime.parse(data);

  // メール本文抽出
  const body = email.text || email.html || "";

  // デバッグ出力
  console.log("Message-Id: " + email.messageId);
  console.log("Subject: " + email.subject);
  console.log("from: " + email.from?.name + "<" + email.from?.address + ">");
  console.log("date: " + email.date);
  console.log("body: " + body.trim().substring(0, 64));

  // 必要項目存在チェック
  if (
    !email.messageId ||
    !email.subject ||
    !email.from?.address ||
    !email.date ||
    !body
  ) {
    console.log("必要情報がありません。");
    return true;
  }
  // DB登録
  try {
    prisma.email.create({
      data: {
        message_id: email.messageId || "",
        subjet: email.subject || "",
        sender: email.from?.name + " <" + email.from?.address + ">" || "",
        received_at: email.date || "",
        body: body || "",
        created_at: new Date(),
      },
    });
  } catch (error) {
    console.error("[ERR] ", error.message);
    return true;
  }
  // キーワード検索
  searchKeyword(body);

  // 正規表現で抽出

  // 正常終了
  return true;
};

const searchKeyword = (body) => {
  keywords.forEach((keyword) => {
    if (body.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())) {
      console.log("Tag: " + keyword);
    }
  });
};
