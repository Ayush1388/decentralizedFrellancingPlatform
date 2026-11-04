import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { Button, CardSkeleton, EmptyState, PageHeader } from "../Components/ui";
import JobForm from "../Components/job/JobForm";

export default function PostJob() {
  const { user, ready, openLogin } = useAuth();
  if (ready && !user) {
    return (
      <div className="container-page pt-16">
        <EmptyState icon="lock" title="Log in to post a job" action={<Button onClick={openLogin}>Log in</Button>}>
          You need an account so freelancers know who they are working with.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="container-page max-w-3xl pb-8">
      <PageHeader
        eyebrow="Casting call"
        image="/Work time-cuate.svg"
        title="Pitch a picture"
        subtitle="Describe the work and break it into milestones. You fund each milestone only after you hire someone. Not ready? Save a draft."
      />
      <JobForm />
    </div>
  );
}

// /jobs/:id/edit  Change a draft or an open posting.
export function EditJob() {
  const { id } = useParams();
  const { user, ready, openLogin } = useAuth();
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !user) return;
    api(`/api/jobs/${id}`)
      .then(setJob)
      .catch((e) => setError(e.message));
  }, [id, ready, user]);

  if (ready && !user)
    return (
      <div className="container-page pt-16">
        <EmptyState icon="lock" title="Log in to edit this job" action={<Button onClick={openLogin}>Log in</Button>} />
      </div>
    );
  if (error)
    return (
      <div className="container-page pt-16">
        <EmptyState icon="alert" title="Job not found" action={<Button to="/jobs">Back to jobs</Button>}>
          {error}
        </EmptyState>
      </div>
    );
  if (!job)
    return (
      <div className="container-page max-w-3xl pt-12">
        <CardSkeleton className="h-96" />
      </div>
    );
  if (job.viewerRole !== "client" || !["draft", "open"].includes(job.status))
    return (
      <div className="container-page pt-16">
        <EmptyState icon="lock" title="This job cannot be edited" action={<Button to={`/jobs/${job.id}`}>Back to the job</Button>}>
          Only the client can edit, and only while the job is a draft or open.
        </EmptyState>
      </div>
    );
  return (
    <div className="container-page max-w-3xl pb-8">
      <PageHeader eyebrow={job.status === "draft" ? "Draft" : "Editing"} title={job.title} subtitle="Applicants are told when you change an open posting." />
      <JobForm job={job} />
    </div>
  );
}
