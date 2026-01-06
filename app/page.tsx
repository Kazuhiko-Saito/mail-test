import POP3Client from "poplib";
import PostalMime from "postal-mime";

const mailsetting = {
  username: process.env.MAILUSERNAME,
  password: process.env.MAILPASSWORD,
  server: {
    name: process.env.MAILSERVERNAME,
    port: process.env.MAILSERVERPORT,
  },
};

const keywords: string[] = [];

let currentMsgNum = 1;
let totalMsgCount = 0;

export default function Home() {
  const client = new POP3Client(
    mailsetting.server.port,
    mailsetting.server.name,
    {
      tlserrs: false,
      enabletls: false,
      debug: false,
    }
  );

  client.on("connect", function () {
    console.log("CONNECT success");
    client.login(mailsetting.username, mailsetting.password);
  });

  client.on("login", function (status, rawdata) {
    if (status) {
      console.log("LOGIN/PASS success");
      client.list();
    } else {
      console.log("LOGIN/PASS failed");
      client.quit();
    }
  });

  client.on("list", function (status, msgcount, msgnumber, data, rawdata) {
    if (status === false) {
      console.log("LIST failed");
      client.quit();
    } else {
      console.log("LIST success with " + msgcount + " element(s)");
      totalMsgCount = msgcount;
      if (msgcount > 0) {
        // メッセージがある場合は最初のメッセージ取得
        client.retr(1);
      } else {
        client.quit();
      }
    }
  });

  client.on("retr", async function (status, msgnumber, data, rawdata) {
    // 現在のメッセージ番号を保持
    currentMsgNum = msgnumber;
    if (status === false) {
      console.log("RETR failed for msgnumber " + msgnumber);
      client.quit();
    } else {
      console.log("RETR success for msgnumber " + msgnumber);
      // メールをパース
      const email = await PostalMime.parse(data);
      console.log("Message-Id: " + email.messageId);
      keywords.forEach((keyword) => {
        if (email.text?.match(keyword)) {
          console.log("Tag: " + keyword);
        }
      });
      // 次のメッセージ取得
      if (currentMsgNum < totalMsgCount) {
        currentMsgNum++;
        client.retr(currentMsgNum);
      } else {
        client.quit();
      }
    }
  });

  client.on("quit", function (status, rawdata) {
    if (status === true) {
      console.log("QUIT success");
    } else {
      console.log("QUIT failed");
    }
  });

  return <h1>Test Page</h1>;
}
