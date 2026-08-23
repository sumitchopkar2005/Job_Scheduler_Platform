import React from "react";
import api from "../lib/api";

export default function usePolling(path, interval = 5000) {
  const [state, setState] = React.useState({
    data: null,
    loading: true,
    error: "",
  });
  React.useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get(path)
        .then(
          (response) =>
            active &&
            setState({ data: response.data.data, loading: false, error: "" }),
        )
        .catch(
          (error) =>
            active &&
            setState({
              data: null,
              loading: false,
              error: error.response?.data?.error?.message || "Request failed",
            }),
        );
    load();
    const timer = setInterval(load, interval);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, interval]);
  return state;
}
