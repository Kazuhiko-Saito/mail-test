import { emailProcessor, getEmailList } from "./lib/email";

const Home = async () => {
  // メール処理
  await emailProcessor();
  // メールリスト取得
  const emails = await getEmailList();
  //
  return (
    <main className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold mb-4">受信トレイ</h1>
      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>件名</th>
              <th>送信者</th>
              <th>受信日時</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => (
              <tr key={email.message_id} className="hover">
                <td>{email.subject}</td>
                <td>{email.sender}</td>
                <td>{email.received_at?.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
};

export default Home;
