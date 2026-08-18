package store

import "database/sql"

func ProfilePreferences(db *sql.DB) map[string]ProfilePreference {
	result := map[string]ProfilePreference{}
	rows, err := db.Query(`SELECT profile_id,nickname,sound,volume,typing_min_ms,typing_max_ms,delay_min_ms,delay_max_ms,work_enabled,work_days,work_start,work_end FROM krio_profile_names`)
	if err != nil {
		return result
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var preference ProfilePreference
		if rows.Scan(&id, &preference.Nickname, &preference.Sound, &preference.Volume, &preference.TypingMin, &preference.TypingMax, &preference.DelayMin, &preference.DelayMax, &preference.WorkEnabled, &preference.WorkDays, &preference.WorkStart, &preference.WorkEnd) == nil {
			result[id] = preference
		}
	}
	return result
}

func SaveProfilePreference(db *sql.DB, profileID, nickname, sound string, volume, typingMin, typingMax, delayMin, delayMax, workEnabled int, workDays, workStart, workEnd string) error {
	_, err := db.Exec(`INSERT INTO krio_profile_names(profile_id,nickname,sound,volume,typing_min_ms,typing_max_ms,delay_min_ms,delay_max_ms,work_enabled,work_days,work_start,work_end) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(profile_id) DO UPDATE SET nickname=excluded.nickname,sound=excluded.sound,volume=excluded.volume,typing_min_ms=excluded.typing_min_ms,typing_max_ms=excluded.typing_max_ms,delay_min_ms=excluded.delay_min_ms,delay_max_ms=excluded.delay_max_ms,work_enabled=excluded.work_enabled,work_days=excluded.work_days,work_start=excluded.work_start,work_end=excluded.work_end`, profileID, nickname, sound, volume, typingMin, typingMax, delayMin, delayMax, workEnabled, workDays, workStart, workEnd)
	return err
}

func ProfileUnread(db *sql.DB, profileID string) int {
	var unread int
	_ = db.QueryRow(`SELECT COALESCE(SUM(unread_count),0) FROM krio_chats WHERE profile_id=?`, profileID).Scan(&unread)
	return unread
}

func ProfileUnreadCounts(db *sql.DB) map[string]int {
	result := map[string]int{}
	rows, err := db.Query(`SELECT profile_id,COALESCE(SUM(unread_count),0) FROM krio_chats GROUP BY profile_id`)
	if err != nil {
		return result
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var unread int
		if rows.Scan(&id, &unread) == nil {
			result[id] = unread
		}
	}
	return result
}
