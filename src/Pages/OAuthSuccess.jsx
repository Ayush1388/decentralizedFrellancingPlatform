import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { Button, ErrorNote, Spinner } from "../Components/ui";

export default function OAuthSuccess() {
  const navigate = useNavigate();
  const { signInWithToken } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setFailed(true);
      return;
    }
    signInWithToken(token).then(() => navigate("/", { replace: true }));
  }, [navigate, signInWithToken]);

  return (
    <div className="container-page flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      {failed ? (
        <>
          <ErrorNote>Google sign-in did not complete. Please try again.</ErrorNote>
          <Button to="/">Back to home</Button>
        </>
      ) : (
        <p className="flex items-center gap-3 text-lg">
          <Spinner /> Logging you in…
        </p>
      )}
    </div>
  );
}
