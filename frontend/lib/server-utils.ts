import fs from "fs";
import path from "path";

export const getEmailsConfig = async (): Promise<string[] | false> => {
  try {
    const filePath = path.join(process.cwd(), "allowed-emails.json");

    if (!fs.existsSync(filePath)) {
      return false;
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");

    const jsonData = JSON.parse(fileContent) as { emails?: string[] };
    return jsonData?.emails ?? [];
  } catch (e) {
    console.error(`Failed to read allowed-emails.json ${e}`);
    return false;
  }
};
