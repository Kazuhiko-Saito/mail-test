import POP3Client from "poplib";
import PostalMime from "postal-mime";
import { prisma } from "./lib/prisma";
import { emailProcessor } from "./lib/email";

export default function Home() {
  // メール処理
  emailProcessor();
  //
  return <h1>Test Page</h1>;
}
