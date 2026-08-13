import { Message, sequelize } from "./db";

let ready;
function prepare() {
  ready ||= sequelize.sync();
  return ready;
}

export async function listMessages() {
  await prepare();
  const messages = await Message.findAll({ order: [["createdAt", "DESC"]], limit: 20 });
  return messages.map((message) => message.toJSON());
}

export async function createMessage(values) {
  await prepare();
  return Message.create(values);
}

export async function finishMessage(message, status, httpStatus, response) {
  await message.update({ status, httpStatus, response });
  return message;
}
