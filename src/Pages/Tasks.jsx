// pages/Developers.jsx
import { useState } from "react";
export default function Tasks() {
    const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    budget: "",
    developer: "",
    file: null,
    status: "Pending",
  });

  const developers = ["Ayush Pandey", "Sarah Lee", "Michael Chen"];

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setForm({
      ...form,
      [name]: files ? files[0] : value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setTasks([...tasks, form]);
    setForm({
      title: "",
      description: "",
      dueDate: "",
      budget: "",
      developer: "",
      file: null,
      status: "Pending",
    });
  };

  const markAsDone = (index) => {
    const updated = [...tasks];
    updated[index].status = "Completed";
    setTasks(updated);
  };

  return ( 
    <div className="max-w-6xl mx-auto py-10 px-6">
      <h2 className="text-3xl font-bold mb-8">Tasks</h2>

      {/* Task Form */}
      <form
        onSubmit={handleSubmit}
        className="grid md:grid-cols-2 gap-6 bg-white shadow-md rounded-xl p-8"
      >
        <div className="space-y-4">
          <input
            type="text"
            name="title"
            placeholder="Project Title"
            value={form.title}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg"
            required
          />

          <textarea
            name="description"
            placeholder="Project Description"
            value={form.description}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg"
            rows="4"
            required
          />

          <select
            name="developer"
            value={form.developer}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg"
            required
          >
            <option value="">Assign Developer</option>
            {developers.map((dev, i) => (
              <option key={i} value={dev}>
                {dev}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          <input
            type="date"
            name="dueDate"
            value={form.dueDate}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg"
            required
          />

          <input
            type="number"
            name="budget"
            placeholder="Budget ($)"
            value={form.budget}
            onChange={handleChange}
            className="w-full p-3 border rounded-lg"
            required
          />

          <input
            type="file"
            name="file"
            onChange={handleChange}
            className="w-full p-3 border rounded-lg"
          />

          <button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-full font-semibold"
          >
            Submit Task
          </button>
        </div>
      </form>

      {/* Task Cards */}
      <h3 className="text-2xl font-bold mt-12 mb-6">Task Cards</h3>
      <div className="grid md:grid-cols-3 gap-6">
        {tasks.map((task, index) => (
          <div key={index} className="bg-white p-6 rounded-xl shadow-md">
            <h4 className="text-xl font-semibold">{task.title}</h4>
            <p className="text-gray-600 text-sm">{task.description}</p>
            <p className="mt-2 text-sm">👨‍💻 Assigned: {task.developer}</p>
            <p className="text-sm">📅 Due: {task.dueDate}</p>
            <p className="text-sm">💰 Budget: ${task.budget}</p>
            {task.file && (
              <p className="text-sm text-blue-600">📎 {task.file.name}</p>
            )}
            <span
              className={`inline-block mt-3 px-3 py-1 text-sm rounded-full ${
                task.status === "Completed"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {task.status}
            </span>
            {task.status !== "Completed" && (
              <button
                onClick={() => markAsDone(index)}
                className="block mt-4 w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-full"
              >
                Mark as Done
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

