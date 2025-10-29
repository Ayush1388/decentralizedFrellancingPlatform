export default function Testimonial() {
    return (
       
        <div className="py-4 shadow-md rounded-xl w-90">
        <div className="flex justify-center">
          <img className="  rounded-full w-12 h-12  " src="public\profile1.svg"></img>
          <div>
            <h2 className="text-lg font-semibold">
              Sarah Lee
            </h2>
            <p className="text-sm text-gray-500">
              Founder @ DeFiLabs
            </p>
          </div>
        </div>
        <p className="text-gray-600 mt-3 italic px-4">
          “We were struggling to find skilled Web3 developers for our DeFi project.
          Traditional freelancing sites were slow and risky, and payments were a nightmare.
        </p>
        <div className="mx-25">⭐⭐⭐⭐⭐</div>
      </div>
    )
};