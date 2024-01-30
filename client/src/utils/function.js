import axios from "axios";
import config from "./apiUrl";
import moment from "moment";

export const getProfile = async (userId) => {
  try {
    const res = await axios.get(`${config.apiUrl}users?userId=${userId}`);
    console.log(res.data.profile);
    return res.data.profile;
  } catch (error) {
    throw error;
  }
};

export const getTimeAndDate = (date) => {
  const now = moment();
  const messageDate = moment(date);

  if (now.isSame(messageDate, "day")) {
    return moment(date).format("hh:mm A");
  } else if (now.subtract(1, "day").isSame(messageDate, "day")) {
    return "Yesterday";
  } else {
    return moment(date).format("MMM DD");
  }
};
