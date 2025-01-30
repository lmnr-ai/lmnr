import fs from "fs";
import path from "path";

const allowedEmailsFileName = "allowed-emails.json";

export const getEmailsConfig = async (): Promise<string[] | false> => {
  const filePath = path.join(process.cwd(), allowedEmailsFileName);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");

  const jsonData = JSON.parse(fileContent) as { emails?: string[] };

  if (!jsonData?.emails) {
    throw new Error(`Invalid file format for ${allowedEmailsFileName}`);
  }

  return jsonData.emails;
};
