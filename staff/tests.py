from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

# Get the custom user model
Staff = get_user_model()

class TokenObtainPairTest(APITestCase):
    def setUp(self):
        """
        Set up the test environment.
        This method is called before each test in this class.
        """
        self.username = 'testuser'
        self.password = 'testpassword123'
        self.user = Staff.objects.create_user(username=self.username, password=self.password)
        
        # The URL for the token obtain pair view
        self.token_url = reverse('token_obtain_pair')

    def test_token_obtain_success(self):
        """
        Ensure we can obtain a token with valid credentials.
        """
        data = {
            'username': self.username,
            'password': self.password
        }
        response = self.client.post(self.token_url, data, format='json')
        
        # Assert that the request was successful
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Assert that access and refresh tokens are in the response
        self.assertTrue('access' in response.data)
        self.assertTrue('refresh' in response.data)
        print("\\n✅ test_token_obtain_success: PASSED")


    def test_token_obtain_fail_wrong_password(self):
        """
        Ensure we cannot obtain a token with a wrong password.
        """
        data = {
            'username': self.username,
            'password': 'wrongpassword'
        }
        response = self.client.post(self.token_url, data, format='json')
        
        # Assert that the request was unauthorized
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        print("\\n✅ test_token_obtain_fail_wrong_password: PASSED")

    def test_token_obtain_fail_wrong_username(self):
        """
        Ensure we cannot obtain a token with a wrong username.
        """
        data = {
            'username': 'wronguser',
            'password': self.password
        }
        response = self.client.post(self.token_url, data, format='json')
        
        # Assert that the request was unauthorized
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        print("\\n✅ test_token_obtain_fail_wrong_username: PASSED")
