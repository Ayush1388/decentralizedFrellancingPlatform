package main

// jobCategories is the fixed list a posting can be filed under. The frontend reads it from /api/config.
var jobCategories = []string{
	"Smart contracts", "Frontend", "Backend", "Full stack", "Design", "Security and audits",
	"Data and indexing", "DevOps", "Writing and docs", "Other",
}

func validCategory(c string) bool {
	if c == "" {
		return true
	}
	for _, x := range jobCategories {
		if x == c {
			return true
		}
	}
	return false
}
