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
const extractions: {name: string, regex: RegExp}[] = [
  {name: "サンプル", regex: /サンプル/g}
];

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
          client.quit();
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
              client.quit();
            }
          } else {
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
    // NULL文字除去
    const cleanMessageId = (email.messageId || "").replace(/\x00/g, "");
    const cleanSubject = (email.subject || "").replace(/\x00/g, "");
    const cleanSender =
      `${email.from?.name || ""} <${email.from?.address || ""}>`.replace(
        /\x00/g,
        ""
      );
    const cleanBody = (body || "").replace(/\x00/g, "");
    // emailテーブルに登録
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
  } catch (e) {
    console.error("[ERR] ", (e as Error).message);
    throw e;
  }
  // キーワード検索
  const tag: string[] | undefined = searchKeyword(body);

  // 正規表現で抽出
  const text: string[] | undefined = extractionRegex(body);

  // 正常終了
  return true;
};

// キーワード検索
const searchKeyword = (body: string) => {
  // キーワードチェック
  if (keywords.length === 0) {
    return [];
  }

  // タグ配列
  const tag: string[] = [];
  
  // キーワード検索
  keywords.forEach((keyword) => {
    if (body.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())) {
      console.log("Tag: " + keyword);
      tag.push(keyword);
    }
  });
  
  // タグ返却
  return tag;
};

// 正規表現で抽出
const extractionRegex = (body: string) => {
  // 正規表現チェック
  if (extractions.length === 0) {
    return;
  }

  // 抽出配列
  const text: string[] = [];

  // 正規表現検索
  extractions.forEach((extraction) => {
    const matches = body.match(extraction.regex);
    if (matches) {
      matches.forEach((match) => {
        text.push(match);
      });
    }
  });

  // 抽出配列返却
  return text;
};

// メールリスト取得
export const getEmailList = async () => {
    // メールリスト取得
    const emails = await prisma.email.findMany({
      select: {
        message_id: true,
        subject: true,
        sender: true,
        received_at: true,
      },
      orderBy: {
        received_at: 'desc',
      },
    });

    // メールリスト返却
    return emails;
}