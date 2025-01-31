import fs from "fs";
import path from "path";

const allowedEmailsFileName = "allowed-emails.json";

export const getEmailsConfig = async (): Promise<string[] | false> => {
  try {
    const filePath = path.join(process.cwd(), allowedEmailsFileName);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    const fileContent = await fs.promises.readFile(filePath, "utf-8");
    const jsonData = JSON.parse(fileContent) as { emails?: string[] };

    return jsonData?.emails ?? [];
  } catch (e) {
    throw new Error(`Invalid file format for ${allowedEmailsFileName}`);
  }
};
