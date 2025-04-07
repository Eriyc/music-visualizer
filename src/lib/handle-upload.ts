import { invoke } from "@tauri-apps/api/core";

type Result = {
  success: boolean;
  message: string;
  file_path?: string;
};

const sanitizeFilename = (filename: string) => {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
};

export const handleUpload = async (file: File): Promise<Result> =>
  new Promise((res, rej) => {
    try {
      const reader = new FileReader();

      reader.onload = async (event) => {
        const base64Data = (event.target?.result as string).split(",")[1]; // Extract base64 part
        const filename = sanitizeFilename(file.name); // Sanitize filename

        const result = await invoke<Result>("upload_logo", {
          filename: filename,
          fileData: base64Data,
        });

        if (result.success) {
          return res({
            success: true,
            message: "Logo uploaded successfully",
            file_path: `${filename}`,
          });
        }
        return rej({
          success: false,
          message: "Logo upload failed",
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      rej({
        success: false,
        message: `Upload failed: ${error}`,
      });
    }
  });
