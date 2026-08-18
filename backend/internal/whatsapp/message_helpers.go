package whatsapp

import (
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
)

func TextOf(message *waE2E.Message) string {
	if message == nil {
		return ""
	}
	if text := message.GetConversation(); text != "" {
		return text
	}
	return message.GetExtendedTextMessage().GetText()
}

func ContextOf(message *waE2E.Message) *waE2E.ContextInfo {
	message = UnwrapMessage(message)
	switch {
	case message.GetExtendedTextMessage() != nil:
		return message.GetExtendedTextMessage().GetContextInfo()
	case message.GetImageMessage() != nil:
		return message.GetImageMessage().GetContextInfo()
	case message.GetVideoMessage() != nil:
		return message.GetVideoMessage().GetContextInfo()
	case message.GetPtvMessage() != nil:
		return message.GetPtvMessage().GetContextInfo()
	case message.GetAudioMessage() != nil:
		return message.GetAudioMessage().GetContextInfo()
	case message.GetDocumentMessage() != nil:
		return message.GetDocumentMessage().GetContextInfo()
	case message.GetStickerMessage() != nil:
		return message.GetStickerMessage().GetContextInfo()
	case message.GetLocationMessage() != nil:
		return message.GetLocationMessage().GetContextInfo()
	case message.GetLiveLocationMessage() != nil:
		return message.GetLiveLocationMessage().GetContextInfo()
	case message.GetContactMessage() != nil:
		return message.GetContactMessage().GetContextInfo()
	case message.GetContactsArrayMessage() != nil:
		return message.GetContactsArrayMessage().GetContextInfo()
	case message.GetPollCreationMessage() != nil:
		return message.GetPollCreationMessage().GetContextInfo()
	case message.GetPollCreationMessageV2() != nil:
		return message.GetPollCreationMessageV2().GetContextInfo()
	case message.GetPollCreationMessageV3() != nil:
		return message.GetPollCreationMessageV3().GetContextInfo()
	case message.GetPollCreationMessageV5() != nil:
		return message.GetPollCreationMessageV5().GetContextInfo()
	case message.GetPollCreationMessageV6() != nil:
		return message.GetPollCreationMessageV6().GetContextInfo()
	case message.GetEventMessage() != nil:
		return message.GetEventMessage().GetContextInfo()
	case message.GetGroupInviteMessage() != nil:
		return message.GetGroupInviteMessage().GetContextInfo()
	case message.GetListResponseMessage() != nil:
		return message.GetListResponseMessage().GetContextInfo()
	case message.GetButtonsResponseMessage() != nil:
		return message.GetButtonsResponseMessage().GetContextInfo()
	case message.GetTemplateButtonReplyMessage() != nil:
		return message.GetTemplateButtonReplyMessage().GetContextInfo()
	case message.GetInteractiveResponseMessage() != nil:
		return message.GetInteractiveResponseMessage().GetContextInfo()
	}
	return nil
}

func PollMetadata(poll *waE2E.PollCreationMessage) map[string]any {
	options := make([]string, 0, len(poll.GetOptions()))
	for _, option := range poll.GetOptions() {
		options = append(options, option.GetOptionName())
	}
	return map[string]any{"options": options, "selectable": poll.GetSelectableOptionsCount(), "endTime": poll.GetEndTime()}
}

func UnwrapMessage(message *waE2E.Message) *waE2E.Message {
	for message != nil {
		switch {
		case message.GetEphemeralMessage() != nil:
			message = message.GetEphemeralMessage().GetMessage()
		case message.GetViewOnceMessage() != nil:
			message = message.GetViewOnceMessage().GetMessage()
		case message.GetViewOnceMessageV2() != nil:
			message = message.GetViewOnceMessageV2().GetMessage()
		default:
			return message
		}
	}
	return message
}
