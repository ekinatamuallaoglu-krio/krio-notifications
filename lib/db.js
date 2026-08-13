import fs from "node:fs";
import path from "node:path";
import { DataTypes, Sequelize } from "sequelize";

const dataDir = process.env.KRIO_DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const globalDb = globalThis;
export const sequelize = globalDb.__sequelize || new Sequelize({
  dialect: "sqlite",
  storage: path.join(dataDir, "messages.sqlite"),
  logging: false,
});

export const Message = sequelize.models.Message || sequelize.define("Message", {
  to: { type: DataTypes.STRING, allowNull: false },
  templateName: { type: DataTypes.STRING, allowNull: false },
  languageCode: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "pending" },
  httpStatus: DataTypes.INTEGER,
  response: DataTypes.TEXT,
});

export const Campaign = sequelize.models.Campaign || sequelize.define("Campaign", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, accountId: { type: DataTypes.STRING, allowNull: false }, name: { type: DataTypes.STRING, allowNull: false }, status: { type: DataTypes.STRING, allowNull: false, defaultValue: "queued" }, nextRunAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, minIntervalSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 }, maxIntervalSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
});
export const CampaignRecipient = sequelize.models.CampaignRecipient || sequelize.define("CampaignRecipient", {
  campaignId: { type: DataTypes.UUID, allowNull: false }, phone: { type: DataTypes.STRING, allowNull: false }, text: { type: DataTypes.TEXT, allowNull: false }, status: { type: DataTypes.STRING, allowNull: false, defaultValue: "queued" }, attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, error: DataTypes.TEXT,
});
export const GlobalSetting = sequelize.models.GlobalSetting || sequelize.define("GlobalSetting", {
  id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 }, minIntervalSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 }, maxIntervalSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
});
export const User = sequelize.models.User || sequelize.define("User", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.TEXT, allowNull: false },
  role: { type: DataTypes.ENUM("admin", "user"), allowNull: false, defaultValue: "user" },
  profileIds: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" },
});
export const Session = sequelize.models.Session || sequelize.define("Session", {
  tokenHash: { type: DataTypes.STRING, primaryKey: true }, userId: { type: DataTypes.UUID, allowNull: false }, expiresAt: { type: DataTypes.DATE, allowNull: false },
});
export const PasswordReset = sequelize.models.PasswordReset || sequelize.define("PasswordReset", {
  tokenHash: { type: DataTypes.STRING, primaryKey: true }, userId: { type: DataTypes.UUID, allowNull: false }, expiresAt: { type: DataTypes.DATE, allowNull: false }, usedAt: DataTypes.DATE,
});
export const SmtpSetting = sequelize.models.SmtpSetting || sequelize.define("SmtpSetting", {
  id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
  host: { type: DataTypes.STRING, allowNull: false }, port: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 587 }, secure: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  username: DataTypes.STRING, encryptedPassword: DataTypes.TEXT, fromName: DataTypes.STRING, fromEmail: { type: DataTypes.STRING, allowNull: false },
});
export const LicenceSetting = sequelize.models.LicenceSetting || sequelize.define("LicenceSetting", {
  id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
  installationId: { type: DataTypes.UUID, allowNull: false, defaultValue: DataTypes.UUIDV4 },
  encryptedKey: DataTypes.TEXT, expirationDate: DataTypes.DATEONLY, checkedAt: DataTypes.DATE,
});

if (process.env.NODE_ENV !== "production") globalDb.__sequelize = sequelize;
