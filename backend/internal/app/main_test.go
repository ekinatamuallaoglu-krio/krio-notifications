package app

import "testing"

func TestMessageValidation(t *testing.T) {
	if validateMessage(" selam ") != nil {
		t.Fatal("valid message rejected")
	}
	if validateMessage("  ") == nil {
		t.Fatal("empty message accepted")
	}
	long := make([]rune, 2001)
	for i := range long {
		long[i] = 'a'
	}
	if validateMessage(string(long)) == nil {
		t.Fatal("long message accepted")
	}
}

func TestParseChatID(t *testing.T) {
	if _, err := parseChatID("905551112233@s.whatsapp.net"); err != nil {
		t.Fatal(err)
	}
	if _, err := parseChatID("not-a-jid"); err == nil {
		t.Fatal("invalid jid accepted")
	}
}

func TestTemplateVariables(t *testing.T) {
	got := templateVariables("Merhaba {{ ad }}, {{sipariş_1}} ve {{ad}}")
	if len(got) != 2 || got[0] != "ad" || got[1] != "sipariş_1" {
		t.Fatalf("unexpected variables: %#v", got)
	}
}
