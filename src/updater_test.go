package main

import (
	"testing"
	"time"
)

func TestNormalizeGitRemote(t *testing.T) {
	tests := []struct {
		name   string
		remote string
		want   string
	}{
		{"https", "https://github.com/Gamer100Dev/Zarad-Website.git", autoUpdateRepository},
		{"ssh alias", "git@github.com:Gamer100Dev/Zarad-Website.git", autoUpdateRepository},
		{"ssh url", "ssh://git@github.com/Gamer100Dev/Zarad-Website.git", autoUpdateRepository},
		{"http", "http://github.com/Gamer100Dev/Zarad-Website", autoUpdateRepository},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := normalizeGitRemote(test.remote); got != test.want {
				t.Fatalf("normalizeGitRemote(%q) = %q, want %q", test.remote, got, test.want)
			}
		})
	}
}

func TestAutoUpdatesEnabled(t *testing.T) {
	for _, value := range []string{"", "1", "true", "yes"} {
		t.Setenv("AUTO_UPDATE", value)
		if !autoUpdatesEnabled() {
			t.Fatalf("AUTO_UPDATE=%q should enable updates", value)
		}
	}
	for _, value := range []string{"0", "false", "off", "no"} {
		t.Setenv("AUTO_UPDATE", value)
		if autoUpdatesEnabled() {
			t.Fatalf("AUTO_UPDATE=%q should disable updates", value)
		}
	}
}

func TestAutoUpdateInterval(t *testing.T) {
	t.Setenv("AUTO_UPDATE_INTERVAL", "")
	if got := autoUpdateInterval(); got != defaultUpdatePeriod {
		t.Fatalf("default interval = %s, want %s", got, defaultUpdatePeriod)
	}

	t.Setenv("AUTO_UPDATE_INTERVAL", "12m")
	if got := autoUpdateInterval(); got != 12*time.Minute {
		t.Fatalf("configured interval = %s, want %s", got, 12*time.Minute)
	}

	t.Setenv("AUTO_UPDATE_INTERVAL", "1s")
	if got := autoUpdateInterval(); got != defaultUpdatePeriod {
		t.Fatalf("interval below minimum = %s, want %s", got, defaultUpdatePeriod)
	}
}
