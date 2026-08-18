package app

import (
	"testing"

	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"google.golang.org/protobuf/proto"
)

func TestVisibleMessageTypes(t *testing.T) {
	tests := []struct {
		name string
		msg  *waE2E.Message
		kind string
		text string
	}{
		{"text", &waE2E.Message{Conversation: proto.String("merhaba")}, "text", "merhaba"},
		{"device text", &waE2E.Message{DeviceSentMessage: &waE2E.DeviceSentMessage{Message: &waE2E.Message{Conversation: proto.String("kendime")}}}, "text", "kendime"},
		{"ephemeral text", &waE2E.Message{EphemeralMessage: &waE2E.FutureProofMessage{Message: &waE2E.Message{Conversation: proto.String("iletildi")}}}, "text", "iletildi"},
		{"image", &waE2E.Message{ImageMessage: &waE2E.ImageMessage{Caption: proto.String("foto"), Mimetype: proto.String("image/jpeg")}}, "image", "foto"},
		{"location", &waE2E.Message{LocationMessage: &waE2E.LocationMessage{Name: proto.String("Ofis"), DegreesLatitude: proto.Float64(41), DegreesLongitude: proto.Float64(29)}}, "location", ""},
		{"contact", &waE2E.Message{ContactMessage: &waE2E.ContactMessage{DisplayName: proto.String("Ayşe"), Vcard: proto.String("BEGIN:VCARD")}}, "contact", "Ayşe"},
		{"poll", &waE2E.Message{PollCreationMessage: &waE2E.PollCreationMessage{Name: proto.String("Hangisi?"), Options: []*waE2E.PollCreationMessage_Option{{OptionName: proto.String("A")}}}}, "poll", "Hangisi?"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			kind, text, _, _, _, _, _, _ := visibleMessage(test.msg)
			if kind != test.kind || text != test.text {
				t.Fatalf("got %q %q", kind, text)
			}
		})
	}
}
