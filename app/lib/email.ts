import POP3Client from "poplib";
import PostalMime from "postal-mime";
import jschardet from "jschardet";
import iconv from "iconv-lite";
import { prisma } from "./prisma";

const mailsetting = {
  username: process.env.MAIL_USERNAME,
  password: process.env.MAIL_PASSWORD,
  server: {
    name: process.env.MAIL_SERVERNAME,
    port: process.env.MAIL_SERVERPORT,
  },
};

// 検索用キーワード
const keywords: string[] = [];

// 抽出用キーワード
const regexStrings: string[] = [];

let currentMsgNum: number = 1;
let totalMsgCount: number = 0;

export const emailProcessor = () => {
  return new Promise<void>((resolve, reject) => {
    const client = new POP3Client(
      mailsetting.server.port,
      mailsetting.server.name,
      {
        tlserrs: false,
        enabletls: false,
        debug: false,
      }
    );

    client.on("error", (err) => {
      console.error("POP3 client error:", err);
      client.quit();
      reject(err);
    });

    client.on("connect", () => {
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
        reject(new Error("LOGIN/PASS failed"));
      }
    });

    client.on("list", (status, msgcount, msgnumber, data, rawdata) => {
      if (!status) {
        console.log("LIST failed");
        client.quit();
        reject(new Error("LIST failed"));
      } else {
        console.log("LIST success with " + msgcount + " element(s)");
        totalMsgCount = msgcount;
        if (msgcount > 0) {
          currentMsgNum = 1;
          client.retr(currentMsgNum);
        } else {
          client.quit(); // No messages, we're done.
        }
      }
    });

    client.on("retr", async (status, msgnumber, data, rawdata) => {
      currentMsgNum = msgnumber;
      if (!status) {
        console.log("RETR failed for msgnumber " + msgnumber);
        client.quit();
        reject(new Error(`RETR failed for msgnumber ${msgnumber}`));
      } else {
        console.log("RETR success for msgnumber " + msgnumber);
        try {
          if (await storeMail(data)) {
            if (currentMsgNum < totalMsgCount) {
              currentMsgNum++;
              client.retr(currentMsgNum);
            } else {
              client.quit(); // All messages processed
            }
          } else {
            // storeMail returned false, indicating we should stop.
            client.quit();
          }
        } catch (e) {
          console.error("Error during storeMail:", e);
          client.quit();
          reject(e);
        }
      }
    });

    client.on("quit", (status, rawdata) => {
      if (status) {
        console.log("QUIT success");
        resolve();
      } else {
        console.log("QUIT failed");
        reject(new Error("QUIT failed"));
      }
    });
  });
};

const storeMail = async (data: string) => {
  // Bufferにメールデータを入れて文字コード判定
  const buffer = Buffer.from(data, "binary");
  const detected = jschardet.detect(buffer);
  let emailDataString: string;
  if (
    detected &&
    detected.encoding &&
    detected.confidence > 0.95 &&
    !["UTF-8", "ASCII"].includes(detected.encoding.toUpperCase()) &&
    iconv.encodingExists(detected.encoding)
  ) {
    console.log(
      `Detected encoding: ${detected.encoding} (confidence: ${detected.confidence}). Converting to UTF-8.`
    );
    emailDataString = iconv.decode(buffer, detected.encoding);
  } else {
    emailDataString = buffer.toString("utf8");
  }

  // メールパースと本文抽出
  const email = await PostalMime.parse(emailDataString);
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
    const cleanMessageId = (email.messageId || "").replace(/\x00/g, "");
    const cleanSubject = (email.subject || "").replace(/\x00/g, "");
    const cleanSender =
      `${email.from?.name || ""} <${email.from?.address || ""}>`.replace(
        /\x00/g,
        ""
      );
    const cleanBody = (body || "").replace(/\x00/g, "");

    await prisma.email.upsert({
      where: {
        message_id: cleanMessageId,
      },
      create: {
        message_id: cleanMessageId,
        subject: cleanSubject,
        sender: cleanSender,
        received_at: email.date ? new Date(email.date) : new Date(),
        body: cleanBody,
      },
      update: {
        subject: cleanSubject,
        sender: cleanSender,
        received_at: email.date ? new Date(email.date) : new Date(),
        body: cleanBody,
      },
    });
  } catch (error) {
    console.error("[ERR] ", (error as Error).message);
    throw error;
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

export const getEmailList = async () => {
    // 
    const emails = await prisma.email.findMany();
    // 
    return emails;
}