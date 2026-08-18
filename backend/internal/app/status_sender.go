package app

import (
	"context"
	"fmt"

	"go.mau.fi/whatsmeow"
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"

	"krio-chat/backend/internal/status"
)

var errStatusDisconnected = status.ErrDisconnected

func (w *whatsApp) sendStatus(ctx context.Context, post StatusPost) error {
	client, err := w.profileClient(post.ProfileID)
	if err != nil {
		return err
	}
	if !client.IsConnected() || !client.IsLoggedIn() {
		return errStatusDisconnected
	}
	message := &waE2E.Message{Conversation: proto.String(post.Text)}
	if post.Kind != "text" {
		mediaType := whatsmeow.MediaImage
		if post.Kind == "video" {
			mediaType = whatsmeow.MediaVideo
		}
		upload, err := client.Upload(ctx, post.Media, mediaType)
		if err != nil {
			return fmt.Errorf("status medyası yüklenemedi: %w", err)
		}
		if post.Kind == "image" {
			message = &waE2E.Message{ImageMessage: &waE2E.ImageMessage{Caption: proto.String(post.Text), Mimetype: proto.String(post.Mime), URL: &upload.URL, DirectPath: &upload.DirectPath, MediaKey: upload.MediaKey, FileEncSHA256: upload.FileEncSHA256, FileSHA256: upload.FileSHA256, FileLength: &upload.FileLength}}
		} else {
			message = &waE2E.Message{VideoMessage: &waE2E.VideoMessage{Caption: proto.String(post.Text), Mimetype: proto.String(post.Mime), URL: &upload.URL, DirectPath: &upload.DirectPath, MediaKey: upload.MediaKey, FileEncSHA256: upload.FileEncSHA256, FileSHA256: upload.FileSHA256, FileLength: &upload.FileLength}}
		}
	}
	if _, err = client.SendMessage(ctx, types.StatusBroadcastJID, message); err != nil {
		return fmt.Errorf("status gönderilemedi: %w", err)
	}
	return nil
}
