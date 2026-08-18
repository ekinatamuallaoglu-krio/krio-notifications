package app

import (
	"strconv"
	"strings"
	"time"
)

func parseWorkDays(daysStr string) map[time.Weekday]bool {
	result := map[time.Weekday]bool{}
	if daysStr == "" {
		return result
	}
	for _, part := range strings.Split(daysStr, ",") {
		part = strings.TrimSpace(part)
		if n, err := strconv.Atoi(part); err == nil && n >= 1 && n <= 7 {
			result[time.Weekday(n%7)] = true
		}
	}
	return result
}

func parseWorkTime(timeStr string) (hour, minute int, ok bool) {
	parts := strings.SplitN(timeStr, ":", 2)
	if len(parts) != 2 {
		return 0, 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, 0, false
	}
	return h, m, true
}

func isWithinWorkHours(pref profilePreference, now time.Time) bool {
	if pref.WorkEnabled == 0 {
		return true
	}
	workDays := parseWorkDays(pref.WorkDays)
	if !workDays[now.Weekday()] {
		return false
	}
	startH, startM, ok1 := parseWorkTime(pref.WorkStart)
	endH, endM, ok2 := parseWorkTime(pref.WorkEnd)
	if !ok1 || !ok2 {
		return true
	}
	startMin := startH*60 + startM
	endMin := endH*60 + endM
	nowMin := now.Hour()*60 + now.Minute()
	return nowMin >= startMin && nowMin < endMin
}

func nextWorkWindowStart(pref profilePreference, now time.Time) time.Time {
	if pref.WorkEnabled == 0 {
		return now
	}
	startH, startM, ok := parseWorkTime(pref.WorkStart)
	if !ok {
		return now
	}
	workDays := parseWorkDays(pref.WorkDays)
	for dayOffset := 0; dayOffset < 7; dayOffset++ {
		candidate := now.AddDate(0, 0, dayOffset).Truncate(24 * time.Hour).Add(time.Duration(startH*60+startM) * time.Minute)
		if candidate.After(now) && workDays[candidate.Weekday()] {
			return candidate
		}
	}
	return now.Add(24 * time.Hour)
}
