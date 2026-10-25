export const jobStatus = {
  open: { label: "Open", tone: "green" },
  filled: { label: "Filled", tone: "violet" },
  in_progress: { label: "In progress", tone: "blue" },
  completed: { label: "Completed", tone: "gray" },
  cancelled: { label: "Cancelled", tone: "red" },
};

// Where an application stands, as the applicant sees it.
export const appStatus = {
  pending: { label: "Awaiting client", tone: "amber" },
  shortlisted: { label: "Shortlisted", tone: "blue" },
  declined: { label: "Not selected", tone: "gray" },
  accepted: { label: "Hired", tone: "green" },
};
