package app

import (
	"testing"

	"go.mau.fi/whatsmeow/types"
)

func TestStatusBroadcastIsIgnored(t *testing.T) {
	if !ignoredChat(types.StatusBroadcastJID) {
		t.Fatal("status broadcast accepted as a chat")
	}
}
