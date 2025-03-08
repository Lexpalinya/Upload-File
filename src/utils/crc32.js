import pkg from "crc-32";
const { crc32 } = pkg;
export const getCrc32 = (buffer) => {
  const crc = crc32(buffer).toString(16).padStart(8, "0").toUpperCase();
  return crc;
};