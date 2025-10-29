import { useState, useEffect } from "react";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import DeveloperCard from "../Components/DeveloperCard.jsx";

export default function Developers() {
  const [developers, setDevelopers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    title: "",
    bio: "",
    hourlyRate: "",
    jobsDone: "",
    rating: "",
    skills: "",
    image: null,
  });
  
  const [editingId, setEditingId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [hasProfile, setHasProfile] = useState(false);

  // ✅ Decode logged-in user ID from token
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      const decoded = jwtDecode(token);
      setCurrentUserId(decoded.id);
    }
  }, []);

  // ✅ Fetch developers
  useEffect(() => {
    axios.get("http://localhost:3001/api/developers").then((res) => {
      setDevelopers(res.data);
      if (currentUserId) {
        const found = res.data.find((d) => d.user === currentUserId);
        setHasProfile(!!found);
      }
    });
  }, [currentUserId]);

  // ✅ Handle input changes
  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setForm({ ...form, [name]: files ? files[0] : value });
  };

  // ✅ Create or Update Developer
  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Please login first");
      return;
    }

    try {
      const formData = new FormData();
      Object.keys(form).forEach((key) => {
        formData.append(key, form[key]);
      });

      let response;
      if (editingId) {
        response = await axios.put(
          `http://localhost:3001/api/developers/${editingId}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setDevelopers(
          developers.map((dev) => (dev._id === editingId ? response.data : dev))
        );
        setEditingId(null);
      } else {
        response = await axios.post(
          "http://localhost:3001/api/developers",
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setDevelopers([...developers, response.data]);
        setHasProfile(true);
      }

      setForm({
        name: "",
        title: "",
        bio: "",
        hourlyRate: "",
        jobsDone: "",
        rating: "",
        skills: "",
        image: null,
      });
    } catch (err) {
      console.error("Error saving developer:", err.response?.data || err);
      alert(err.response?.data?.error || "Error saving developer");
    }
  };

  // ✅ Delete developer
  const handleDelete = async (id) => {
    const token = localStorage.getItem("token");
    try {
      await axios.delete(`http://localhost:3001/api/developers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDevelopers(developers.filter((dev) => dev._id !== id));
      setHasProfile(false);
    } catch (err) {
      console.error("Error deleting developer:", err);
    }
  };

  // ✅ Load developer data into form for editing
  const handleEdit = (dev) => {
    setForm({
      name: dev.name,
      title: dev.title,
      bio: dev.bio,
      hourlyRate: dev.hourlyRate,
      jobsDone: dev.jobsDone,
      rating: dev.rating,
      skills: dev.skills.join(", "),
      image: null,
    });
    setEditingId(dev._id);
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-6">
      {currentUserId && (!hasProfile || editingId) ? (
        <>
          <h2 className="text-3xl font-bold mb-6">
            {editingId ? "Edit Your Profile" : "Create Your Developer Profile"}
          </h2>
          <form
            onSubmit={handleSubmit}
            className="bg-white shadow-md rounded-xl p-8 grid gap-6"
            encType="multipart/form-data"
          >
            <input type="text" name="name" placeholder="Full Name" value={form.name} onChange={handleChange} className="w-full p-3 border rounded-lg" required />
            <input type="text" name="title" placeholder="Job Title" value={form.title} onChange={handleChange} className="w-full p-3 border rounded-lg" required />
            <input type="number" name="hourlyRate" placeholder="Hourly Rate ($)" value={form.hourlyRate} onChange={handleChange} className="w-full p-3 border rounded-lg" required />
            <input type="number" name="jobsDone" placeholder="Jobs Completed (e.g. 12)" value={form.jobsDone} onChange={handleChange} className="w-full p-3 border rounded-lg" />
            <input type="number" step="0.1" max="5" min="1" name="rating" placeholder="Rating (1.0 - 5.0)" value={form.rating} onChange={handleChange} className="w-full p-3 border rounded-lg" />
            <textarea name="bio" placeholder="Short Bio" value={form.bio} onChange={handleChange} className="w-full p-3 border rounded-lg" />
            <input type="text" name="skills" placeholder="Skills (comma separated)" value={form.skills} onChange={handleChange} className="w-full p-3 border rounded-lg" />
            <input type="file" name="image" accept="image/*" onChange={handleChange} className="w-full p-3 border rounded-lg" />
            <button className="bg-green-600 text-white py-2 rounded-lg hover:bg-green-700">
              {editingId ? "Update Profile" : "Create Profile"}
            </button>
          </form>
        </>
      ) : !currentUserId ? (
        <p className="text-red-500">Please login to create a profile ✋</p>
      ) : (
        <p className="text-gray-500">✅ Your profile is listed below.</p>
      )}

      <h3 className="text-2xl font-bold mt-10 mb-6">All Developers</h3>
      <div className="grid md:grid-cols-3 gap-6">
        {developers.map((dev) => (
          <div key={dev._id}>
            <DeveloperCard dev={dev} />
            {dev.user === currentUserId && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => handleEdit(dev)} className="bg-blue-500 px-3 py-1 text-white rounded">Edit</button>
                <button onClick={() => handleDelete(dev._id)} className="bg-red-500 px-3 py-1 text-white rounded">Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
