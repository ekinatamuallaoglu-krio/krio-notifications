package app

import "context"

func currentUser(rctx context.Context) appUser {
	user, _ := rctx.Value(userContextKey{}).(appUser)
	return user
}

func canProfile(user appUser, profile string) bool {
	if user.Role == "admin" {
		return true
	}
	for _, value := range user.ProfileIDs {
		if value == profile {
			return true
		}
	}
	return false
}

func canTemplate(user appUser, id int64) bool {
	if user.Role == "admin" {
		return true
	}
	for _, value := range user.TemplateIDs {
		if value == id {
			return true
		}
	}
	return false
}
