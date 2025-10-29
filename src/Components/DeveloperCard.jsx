// src/Components/DeveloperCard.jsx

// Extended skill colors
const skillColors = {
  // Frontend
  React: "bg-blue-100 text-blue-600",
  "Next.js": "bg-gray-100 text-gray-800",
  Vue: "bg-green-100 text-green-600",
  Angular: "bg-red-100 text-red-600",
  Svelte: "bg-orange-100 text-orange-600",
  Tailwind: "bg-cyan-100 text-cyan-600",

  // Backend
  "Node.js": "bg-green-100 text-green-600",
  Express: "bg-gray-200 text-gray-700",
  Django: "bg-green-200 text-green-700",
  Flask: "bg-teal-100 text-teal-600",
  Spring: "bg-green-300 text-green-800",

  // Languages
  JavaScript: "bg-yellow-100 text-yellow-700",
  TypeScript: "bg-blue-200 text-blue-700",
  Python: "bg-indigo-100 text-indigo-600",
  Java: "bg-red-200 text-red-700",
  C: "bg-gray-200 text-gray-800",
  "C++": "bg-purple-200 text-purple-700",
  "C#": "bg-green-200 text-green-700",
  Go: "bg-cyan-200 text-cyan-700",
  Rust: "bg-orange-200 text-orange-700",
  PHP: "bg-violet-100 text-violet-600",
  Ruby: "bg-pink-100 text-pink-600",

  // Web3 / Blockchain
  Solidity: "bg-purple-100 text-purple-600",
  Hardhat: "bg-yellow-200 text-yellow-700",
  Truffle: "bg-orange-200 text-orange-600",
  Web3: "bg-green-200 text-green-600",
  EtherJS: "bg-indigo-200 text-indigo-700",

  // Databases
  MongoDB: "bg-green-100 text-green-700",
  PostgreSQL: "bg-blue-100 text-blue-700",
  MySQL: "bg-orange-100 text-orange-700",
  Redis: "bg-red-200 text-red-700",

  // Cloud / DevOps
  AWS: "bg-yellow-200 text-yellow-800",
  Docker: "bg-blue-200 text-blue-700",
  Kubernetes: "bg-cyan-200 text-cyan-700",
  Firebase: "bg-orange-200 text-orange-700",
  Git: "bg-red-100 text-red-600",
  GitHub: "bg-gray-200 text-gray-800",
};

export default function DeveloperCard({ dev }) {
  if (!dev) {
  return null;
}

  return (
    <div className="flex flex-col shadow-md hover:shadow-lg w-90 gap-2 h-90 px-4 py-4 rounded-2xl">
      <div className="flex justify-center">
        <img
          src={dev.image ? `http://localhost:3001${dev.image}` : "/defaultProfile.svg"}
          alt="Developer"
          className="w-14 h-14 rounded-full mb-2"
        />
        <div>
          {/* Name & Title */}
          <h3 className="text-xl mt-2 mx-2 font-bold">{dev.name}</h3>
          <p className="text-gray-500 mx-2">{dev.title}</p>
        </div>
      </div>

      <div className="flex justify-center items-center mt-3 gap-2 text-md text-gray-800 font-light">
        <div className="gap-2 mx-4 flex ">${dev.hourlyRate}/hr</div>
        <div>{dev.jobsDone || 0} jobs</div>
        <div>⭐{dev.rating || "N/A"}</div>
      </div>

      <div className="flex justify-center gap-1 flex-wrap mt-3">
        {dev.skills?.map((skill, i) => (
          <span
            key={i}
            className={`px-3 py-1 rounded-full text-sm ${
              skillColors[skill] || "bg-gray-100 text-gray-600"
            }`}
          >
            {skill}
          </span>
        ))}
      </div>

      <p className="text-gray-600 mt-4 mx-2 text-sm text-center">{dev.bio}</p>

      <button className="bg-green-600 hover:bg-blue-700 text-white mt-5 px-10 mx-5 py-2 rounded-md font-semibold">
        Hire Me
      </button>
    </div>
  );
}
