package app

import (
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestScheduledStatusPersistenceAndOwnership(t *testing.T) {
	db, err := openAppStore(filepath.Join(t.TempDir(), "krio.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	owner, _ := createUser(db, "owner", "password1", "user", []string{"profile-a"}, nil)
	other, _ := createUser(db, "other", "password2", "user", []string{"profile-a"}, nil)
	scheduled := time.Now().Add(-time.Second)
	post, err := createStatusPost(db, owner.ID, "profile-a", "image", "Merhaba", "image/png", "test.png", []byte{1, 2, 3}, scheduled)
	if err != nil {
		t.Fatal(err)
	}
	items, err := statusPostsForUser(db, owner)
	if err != nil || len(items) != 1 || items[0].ID != post.ID {
		t.Fatalf("owner status missing: %#v %v", items, err)
	}
	items, _ = statusPostsForUser(db, other)
	if len(items) != 0 {
		t.Fatal("status leaked to another user")
	}
	if deleted, _ := deleteQueuedStatusPost(db, post.ID, other); deleted {
		t.Fatal("another user deleted queued status")
	}
	claimed, ok, err := claimDueStatusPost(db, time.Now())
	if err != nil || !ok || claimed.ID != post.ID || len(claimed.Media) != 3 {
		t.Fatalf("due status not claimed: %#v %v", claimed, err)
	}
	finishStatusPost(db, post.ID, errors.New("send failed"))
	items, _ = statusPostsForUser(db, owner)
	if len(items) != 1 || items[0].Status != "failed" || items[0].Error != "send failed" {
		t.Fatalf("status failure not persisted: %#v", items)
	}
}
