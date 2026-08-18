package app

import (
	"testing"

	waHistorySync "go.mau.fi/whatsmeow/proto/waHistorySync"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

func TestHistorySyncCompletesOnlyAfterMatchingFinalChunk(t *testing.T) {
	const profileID = "905551112233@s.whatsapp.net"
	waiter := &historySyncWaiter{chatID: profileID, done: make(chan struct{}, 1)}
	w := &whatsApp{historyWait: map[string]*historySyncWaiter{profileID: waiter}}
	event := &events.HistorySync{Data: &waHistorySync.HistorySync{
		SyncType:      waHistorySync.HistorySync_ON_DEMAND.Enum(),
		Progress:      proto.Uint32(50),
		Conversations: []*waHistorySync.Conversation{{ID: proto.String(profileID)}},
	}}
	w.completeHistorySync(profileID, event)
	select {
	case <-waiter.done:
		t.Fatal("history sync completed before progress reached 100")
	default:
	}
	event.Data.Progress = proto.Uint32(100)
	w.completeHistorySync(profileID, event)
	select {
	case <-waiter.done:
	default:
		t.Fatal("matching final history chunk did not complete sync")
	}
}
