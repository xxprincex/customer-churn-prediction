import { useRouteError } from "react-router-dom";
const Error = () => {
  const err = useRouteError();
  console.log(err);
  return (
    <div className="m-40 p-40 text-center text-lg font-serif">
      <h1 className="text-2xl font-semibold ">oops..!!</h1>
      <h2>hehe noob ...check code again</h2>
      <h3>
        {err.status}: {err.statusText}
      </h3>
    </div>
  );
};

export default Error;
